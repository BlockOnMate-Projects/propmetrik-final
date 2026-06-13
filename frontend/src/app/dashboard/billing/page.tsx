'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    CreditCard, AlertTriangle, CheckCircle2, XCircle, Loader2,
    Receipt, BarChart3, History as HistoryIcon, LayoutGrid, ArrowRight, X,
    CalendarClock, Sparkles, ExternalLink,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

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
    is_active?: boolean;
}

interface Addon {
    id: string;
    plan_id: string;
    quantity: number;
    status: string;
    plan?: Plan;
}

interface Subscription {
    id: string;
    organization_id?: string;
    user_id?: string;
    plan_id: string;
    status: string;
    billing_interval: string;
    current_period_start: string;
    current_period_end: string;
    cancelled_at?: string;
    cancel_reason?: string;
    payment_provider?: string;
    payment_card_last4?: string;
    payment_card_brand?: string;
    payment_channel?: string;
    last_payment_at?: string;
    next_retry_at?: string;
    renewal_attempts?: number;
    quantity: number;
    plan?: Plan;
    addons?: Addon[];
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
// API helpers
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
// Display config
// ============================================================

type TabId = 'overview' | 'usage' | 'invoices' | 'history';

const STATUS_META: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    trialing: { label: 'Trialing', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
    incomplete: { label: 'Awaiting Payment', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
    past_due: { label: 'Past Due', cls: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
    suspended: { label: 'Suspended', cls: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
    expired: { label: 'Expired', cls: 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20' },
    none: { label: 'No Plan', cls: 'bg-muted text-muted-foreground border-border' },
};

const INVOICE_COLORS: Record<string, string> = {
    paid: 'text-emerald-600 dark:text-emerald-400',
    pending: 'text-yellow-600 dark:text-yellow-400',
    overdue: 'text-red-600 dark:text-red-400',
    draft: 'text-muted-foreground',
    cancelled: 'text-muted-foreground',
};

const EVENT_LABELS: Record<string, string> = {
    created: 'Subscription created',
    activated: 'Subscription activated',
    upgraded: 'Plan upgraded',
    downgraded: 'Plan downgraded',
    cancelled: 'Subscription cancelled',
    reactivated: 'Subscription reactivated',
    payment_succeeded: 'Payment received',
    payment_failed: 'Payment failed',
    renewed: 'Subscription renewed',
    expired: 'Subscription expired',
    addon_added: 'Add-on added',
    addon_removed: 'Add-on removed',
};

const OUTSTANDING_INVOICE_STATES = ['pending', 'overdue'];

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysRemaining(end?: string) {
    if (!end) return 0;
    const diff = new Date(end).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
}

// ============================================================
// Toast (self-contained — no provider dependency)
// ============================================================

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; title: string; message?: string; }

// ============================================================
// Page
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
    const [payingId, setPayingId] = useState<string | null>(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const toastSeq = useRef(0);
    const verifiedRef = useRef(false);

    const toast = useCallback((kind: ToastKind, title: string, message?: string) => {
        const id = ++toastSeq.current;
        setToasts((t) => [...t, { id, kind, title, message }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    }, []);

    const loadData = useCallback(async () => {
        const [subData, invoiceData, historyData, plansData] = await Promise.all([
            fetchJSON<{ subscription: Subscription | null; usage: UsageMetric[]; modules: Module[] }>(`${API}/subscription`),
            fetchJSON<{ invoices: Invoice[]; total: number }>(`${API}/invoices`),
            fetchJSON<{ events: HistoryEvent[] }>(`${API}/subscription/history`),
            fetchJSON<{ plans: Plan[] }>(`${API}/plans`),
        ]);
        setSubscription(subData?.subscription || null);
        setUsage(subData?.usage || []);
        setModules(subData?.modules || []);
        setInvoices(invoiceData?.invoices || []);
        setHistory(historyData?.events || []);
        setPlans(plansData?.plans || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // After returning from Paystack (?payment=success&ref=...), confirm the
    // charge, toast the result, and strip the query params.
    useEffect(() => {
        if (verifiedRef.current) return;
        const params = new URLSearchParams(window.location.search);
        // Our own `ref`, or Paystack's appended `reference` / `trxref`.
        const ref = params.get('ref') || params.get('reference') || params.get('trxref');
        if (!ref || !ref.startsWith('sub')) return;
        verifiedRef.current = true;
        (async () => {
            const res = await fetchJSON<{ status: string }>(`${API}/verify/${encodeURIComponent(ref)}`);
            if (res?.status === 'success' || res?.status === 'already_paid') {
                toast('success', 'Payment confirmed', 'Your subscription is active.');
            } else {
                toast('error', 'Payment not confirmed', 'If you completed payment, it may take a moment to reflect.');
            }
            window.history.replaceState({}, '', '/dashboard/billing');
            await loadData();
        })();
    }, [toast, loadData]);

    // Actions ------------------------------------------------
    const handleCancel = async () => {
        setActionLoading(true);
        try {
            const res = await authedFetch(`${API}/subscription`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: cancelReason, immediate: false }),
            });
            if (!res.ok) throw new Error();
            setShowCancelModal(false);
            setCancelReason('');
            toast('success', 'Subscription cancelled', 'Access continues until the end of your billing period.');
            await loadData();
        } catch {
            toast('error', 'Could not cancel', 'Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReactivate = async () => {
        setActionLoading(true);
        try {
            const res = await authedFetch(`${API}/subscription/reactivate`, { method: 'POST' });
            if (!res.ok) throw new Error();
            toast('success', 'Subscription reactivated', 'Welcome back!');
            await loadData();
        } catch {
            toast('error', 'Could not reactivate', 'Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleChangePlan = async (planSlug: string) => {
        setActionLoading(true);
        try {
            const res = await authedFetch(`${API}/subscription/change-plan`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_slug: planSlug }),
            });
            if (!res.ok) throw new Error();
            setShowPlanModal(false);
            toast('success', 'Plan updated', 'Your new plan is active.');
            await loadData();
        } catch {
            toast('error', 'Could not change plan', 'Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveAddon = async (addonId: string) => {
        setActionLoading(true);
        try {
            await authedFetch(`${API}/subscription/addons/${addonId}`, { method: 'DELETE' });
            toast('success', 'Add-on removed');
            await loadData();
        } finally {
            setActionLoading(false);
        }
    };

    // Pay an outstanding invoice → redirect to Paystack
    const handlePayInvoice = async (invoiceId: string) => {
        setPayingId(invoiceId);
        try {
            const res = await authedFetch(`${API}/invoices/${invoiceId}/pay`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.payment_url) {
                window.location.href = data.payment_url;
                return;
            }
            toast('error', 'Could not start payment', data.error || 'Please try again.');
        } catch {
            toast('error', 'Could not start payment', 'Please try again.');
        } finally {
            setPayingId(null);
        }
    };

    // Derived ------------------------------------------------
    const plan = subscription?.plan;
    const status = subscription?.status || 'none';
    const statusMeta = STATUS_META[status] || STATUS_META.none;
    const outstanding = invoices
        .filter((i) => OUTSTANDING_INVOICE_STATES.includes(i.status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const perMonth = plan
        ? subscription?.billing_interval === 'annual'
            ? (plan.price_annual_ghs || plan.price_monthly_ghs * 12) / 12
            : plan.price_monthly_ghs
        : 0;
    const needsPayment = ['incomplete', 'past_due', 'suspended'].includes(status);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Toasts */}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
                <AnimatePresence>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: 40 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 40 }}
                            className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur ${
                                t.kind === 'success' ? 'bg-emerald-500/10 border-emerald-500/30'
                                : t.kind === 'error' ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-muted/80 border-border'
                            }`}
                        >
                            {t.kind === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                             : t.kind === 'error' ? <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                             : <Sparkles className="w-5 h-5 text-muted-foreground shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">{t.title}</p>
                                {t.message && <p className="text-xs text-muted-foreground mt-0.5">{t.message}</p>}
                            </div>
                            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Billing & Subscription</h1>
                        <p className="text-muted-foreground text-sm mt-1">Manage your plan, payment method, usage, and invoices.</p>
                    </div>
                    {!subscription && (
                        <Link href="/pricing" className="inline-flex items-center gap-2 bg-primary text-zinc-950 px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition">
                            Choose a plan <ArrowRight className="w-4 h-4" />
                        </Link>
                    )}
                </div>

                {/* Action-required banner */}
                {needsPayment && (
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">
                                    {status === 'incomplete' && 'Complete your payment to activate your subscription.'}
                                    {status === 'past_due' && 'Your last payment failed. Settle the outstanding invoice to keep your access.'}
                                    {status === 'suspended' && 'Your subscription is suspended. Pay the outstanding invoice to restore access.'}
                                </p>
                                {outstanding && (
                                    <p className="text-xs text-amber-200/70 mt-0.5">
                                        Invoice {outstanding.invoice_number} • {formatCurrency(outstanding.total, outstanding.currency)} due {formatDate(outstanding.due_date)}
                                    </p>
                                )}
                            </div>
                        </div>
                        {outstanding && (
                            <button
                                onClick={() => handlePayInvoice(outstanding.id)}
                                disabled={payingId === outstanding.id}
                                className="inline-flex items-center justify-center gap-2 bg-amber-500 text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-400 transition disabled:opacity-60 whitespace-nowrap"
                            >
                                {payingId === outstanding.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                Pay {formatCurrency(outstanding.total, outstanding.currency)}
                            </button>
                        )}
                    </div>
                )}

                {/* Current plan card */}
                <div className="bg-card border border-border rounded-2xl p-6 mb-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-xl font-bold">{plan ? plan.name : 'No active plan'}</h2>
                                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.cls}`}>
                                    {statusMeta.label}
                                </span>
                            </div>
                            {plan && (
                                <p className="text-muted-foreground text-sm capitalize">
                                    {plan.category.replace(/_/g, ' ')} • {plan.tier} • {subscription?.billing_interval} billing
                                </p>
                            )}
                            {/* Renewal / status line */}
                            <div className="mt-2 text-xs flex items-center gap-1.5">
                                <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
                                {subscription?.cancelled_at ? (
                                    <span className="text-red-600 dark:text-red-400">Cancels on {formatDate(subscription.current_period_end)}</span>
                                ) : status === 'active' ? (
                                    <span className="text-muted-foreground">Renews on {formatDate(subscription?.current_period_end)} ({daysRemaining(subscription?.current_period_end)} days)</span>
                                ) : status === 'past_due' && subscription?.next_retry_at ? (
                                    <span className="text-yellow-600 dark:text-yellow-400">Next retry {formatDate(subscription.next_retry_at)}</span>
                                ) : status === 'incomplete' ? (
                                    <span className="text-amber-600 dark:text-amber-400">Awaiting first payment</span>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </div>
                        </div>
                        {plan && (
                            <div className="text-right shrink-0">
                                <p className="text-2xl font-bold text-primary">{formatCurrency(perMonth, plan.price_monthly_ghs ? 'GHS' : 'GHS')}</p>
                                <p className="text-muted-foreground text-xs">per month{subscription?.billing_interval === 'annual' ? ', billed annually' : ''}</p>
                            </div>
                        )}
                    </div>

                    {/* Quick actions */}
                    {subscription && (
                        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-border">
                            {!['cancelled', 'expired'].includes(status) && (
                                <>
                                    <button onClick={() => setShowPlanModal(true)} className="px-4 py-2 bg-muted hover:bg-zinc-700 rounded-lg text-sm font-medium transition">
                                        Change plan
                                    </button>
                                    {outstanding && (
                                        <button
                                            onClick={() => handlePayInvoice(outstanding.id)}
                                            disabled={payingId === outstanding.id}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-lg text-sm font-medium transition disabled:opacity-60"
                                        >
                                            {payingId === outstanding.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                            {subscription.payment_card_last4 ? 'Update payment method' : 'Add payment method'}
                                        </button>
                                    )}
                                    <button onClick={() => setShowCancelModal(true)} className="px-4 py-2 bg-muted hover:bg-red-900/30 text-muted-foreground hover:text-red-400 rounded-lg text-sm font-medium transition ml-auto">
                                        Cancel subscription
                                    </button>
                                </>
                            )}
                            {(status === 'cancelled' || status === 'expired') && (
                                <button onClick={handleReactivate} disabled={actionLoading} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition">
                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    Reactivate
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-card rounded-xl p-1 w-fit">
                    {([
                        { id: 'overview' as TabId, label: 'Overview', icon: LayoutGrid },
                        { id: 'usage' as TabId, label: 'Usage', icon: BarChart3 },
                        { id: 'invoices' as TabId, label: 'Invoices', icon: Receipt },
                        { id: 'history' as TabId, label: 'History', icon: HistoryIcon },
                    ]).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                                tab === t.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-muted-foreground'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />{t.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* ---------------- Overview ---------------- */}
                    {tab === 'overview' && (
                        <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                            {/* Payment method */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Payment method</h3>
                                {subscription?.payment_card_last4 ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                                <CreditCard className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium capitalize">
                                                    {subscription.payment_card_brand || subscription.payment_channel || 'Card'} •••• {subscription.payment_card_last4}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {subscription.last_payment_at ? `Last charged ${formatDate(subscription.last_payment_at)}` : 'Saved for renewals'}
                                                </p>
                                            </div>
                                        </div>
                                        {outstanding && (
                                            <button onClick={() => handlePayInvoice(outstanding.id)} disabled={payingId === outstanding.id} className="text-xs text-primary hover:underline disabled:opacity-60">
                                                Update
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">
                                        No saved card. {subscription?.payment_channel === 'mobile_money'
                                            ? 'Mobile-money payments aren’t saved for automatic renewal — you’ll get an invoice to pay each period.'
                                            : 'A card is saved automatically when you pay an invoice, enabling automatic renewals.'}
                                    </p>
                                )}
                            </div>

                            {/* Active modules */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Active modules</h3>
                                {modules.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No modules active.</p>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {modules.map((mod) => (
                                            <div key={mod.module_slug} className="bg-muted rounded-lg p-3">
                                                <p className="text-sm text-foreground capitalize">{mod.module_slug.replace(/_/g, ' ')}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{mod.access_level} access</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add-ons */}
                            {subscription?.addons && subscription.addons.length > 0 && (
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Add-ons</h3>
                                    <div className="space-y-2">
                                        {subscription.addons.map((addon) => (
                                            <div key={addon.id} className="flex items-center justify-between bg-muted rounded-lg p-3">
                                                <div>
                                                    <p className="text-sm text-foreground">{addon.plan?.name || 'Add-on'}</p>
                                                    <p className="text-xs text-muted-foreground capitalize">{addon.plan?.category?.replace(/_/g, ' ')}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-primary text-sm">{formatCurrency(addon.plan?.price_monthly_ghs || 0)}</span>
                                                    <button onClick={() => handleRemoveAddon(addon.id)} className="text-muted-foreground hover:text-red-400 text-xs transition">Remove</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Features */}
                            {plan && plan.features?.length > 0 && (
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">What’s included</h3>
                                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {plan.features.map((f, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ---------------- Usage ---------------- */}
                    {tab === 'usage' && (
                        <motion.div key="usage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Usage this period</h3>
                                {usage.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No metered limits on your current plan.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {usage.map((u) => {
                                            const pct = Math.min(100, u.percentage_used || 0);
                                            return (
                                                <div key={u.metric}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-sm text-muted-foreground capitalize">{u.metric.replace(/_/g, ' ')}</span>
                                                        <span className="text-xs text-muted-foreground">{u.used.toLocaleString()} / {u.limit_value?.toLocaleString() || '∞'}</span>
                                                    </div>
                                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ---------------- Invoices ---------------- */}
                    {tab === 'invoices' && (
                        <motion.div key="invoices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="bg-card border border-border rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-muted-foreground text-xs">
                                            <th className="text-left py-3 px-4 font-medium">Invoice</th>
                                            <th className="text-left py-3 px-4 font-medium">Period</th>
                                            <th className="text-right py-3 px-4 font-medium">Amount</th>
                                            <th className="text-center py-3 px-4 font-medium">Status</th>
                                            <th className="text-right py-3 px-4 font-medium">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No invoices yet</td></tr>
                                        ) : (
                                            invoices.map((inv) => {
                                                const canPay = OUTSTANDING_INVOICE_STATES.includes(inv.status);
                                                return (
                                                    <tr key={inv.id} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                                                        <td className="py-3 px-4 text-muted-foreground">{inv.invoice_number}</td>
                                                        <td className="py-3 px-4 text-muted-foreground text-xs">{formatDate(inv.billing_period_start)} — {formatDate(inv.billing_period_end)}</td>
                                                        <td className="py-3 px-4 text-right text-foreground">{formatCurrency(inv.total, inv.currency)}</td>
                                                        <td className="py-3 px-4 text-center">
                                                            <span className={`text-xs font-medium ${INVOICE_COLORS[inv.status] || 'text-muted-foreground'}`}>{inv.status.toUpperCase()}</span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            {canPay ? (
                                                                <button
                                                                    onClick={() => handlePayInvoice(inv.id)}
                                                                    disabled={payingId === inv.id}
                                                                    className="inline-flex items-center gap-1.5 bg-primary text-zinc-950 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 transition disabled:opacity-60"
                                                                >
                                                                    {payingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                                                                    Pay
                                                                </button>
                                                            ) : inv.paid_at ? (
                                                                <span className="text-xs text-muted-foreground">Paid {formatDate(inv.paid_at)}</span>
                                                            ) : (
                                                                <span className="text-xs text-zinc-700">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* ---------------- History ---------------- */}
                    {tab === 'history' && (
                        <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Subscription history</h3>
                                {history.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No events to display.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {history.map((evt) => (
                                            <div key={evt.id} className="flex items-start justify-between gap-3 border-l-2 border-border pl-4 py-1.5">
                                                <div>
                                                    <p className="text-sm text-muted-foreground">{EVENT_LABELS[evt.event_type] || evt.event_type}</p>
                                                    {(evt.from_plan_name || evt.to_plan_name) && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {evt.from_plan_name && `${evt.from_plan_name}`}{evt.from_plan_name && evt.to_plan_name && ' → '}{evt.to_plan_name}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(evt.created_at)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Cancel modal */}
            <AnimatePresence>
                {showCancelModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/70 flex items-center justify-center z-[90] p-4">
                        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
                            <h3 className="text-lg font-bold mb-2">Cancel subscription?</h3>
                            <p className="text-muted-foreground text-sm mb-4">
                                You’ll keep access until {formatDate(subscription?.current_period_end)}. After that, your plan will not renew.
                            </p>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Reason for cancelling (optional)"
                                className="w-full bg-muted border border-border rounded-lg p-3 text-sm text-foreground placeholder-zinc-600 mb-4 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <div className="flex gap-3">
                                <button onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2.5 bg-muted rounded-lg text-sm font-medium hover:bg-zinc-700 transition">Keep plan</button>
                                <button onClick={handleCancel} disabled={actionLoading} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition disabled:opacity-60">
                                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}Cancel subscription
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Change-plan modal */}
            <AnimatePresence>
                {showPlanModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/70 flex items-center justify-center z-[90] p-4">
                        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-lg font-bold">Change plan</h3>
                                <button onClick={() => setShowPlanModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                            </div>
                            <p className="text-muted-foreground text-sm mb-4">Switch your plan. Changes take effect immediately.</p>
                            <div className="grid sm:grid-cols-2 gap-3">
                                {plans
                                    .filter((p) => p.is_active !== false && p.slug !== plan?.slug)
                                    .map((p) => {
                                        const isUpgrade = p.price_monthly_ghs > (plan?.price_monthly_ghs || 0);
                                        return (
                                            <button key={p.slug} onClick={() => handleChangePlan(p.slug)} disabled={actionLoading}
                                                className="bg-muted border border-border hover:border-primary/40 rounded-xl p-4 text-left transition disabled:opacity-60">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-semibold text-sm">{p.name}</span>
                                                    <span className="text-primary text-sm">{formatCurrency(p.price_monthly_ghs)}</span>
                                                </div>
                                                <p className="text-muted-foreground text-xs capitalize">{p.category.replace(/_/g, ' ')} • {p.tier}</p>
                                                {plan && (
                                                    <span className={`inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded-full ${isUpgrade ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-700 text-muted-foreground'}`}>
                                                        {isUpgrade ? 'Upgrade' : 'Downgrade'}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                            </div>
                            <p className="text-muted-foreground text-xs mt-4 text-center">
                                <Link href="/pricing" className="inline-flex items-center gap-1 text-primary hover:underline">Compare all plans <ExternalLink className="w-3 h-3" /></Link>
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
