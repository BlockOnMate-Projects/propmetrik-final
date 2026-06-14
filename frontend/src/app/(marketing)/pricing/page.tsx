'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

// ============================================================
// Types
// ============================================================

type ServiceCategory = 'full_platform' | 'valuation_services' | 'property_management' | 'crm' | 'data_intelligence' | 'project_management';
type Segment = 'all' | 'b2c' | 'b2b';
type BillingInterval = 'monthly' | 'annual';

interface PlanData {
    id: string;
    slug: string;
    name: string;
    description?: string;
    category: ServiceCategory;
    tier: string;
    segment: string;
    price_monthly_ghs: number;
    price_annual_ghs?: number;
    price_monthly_usd?: number;
    price_annual_usd?: number;
    max_users?: number;
    max_properties?: number;
    max_api_calls_monthly?: number;
    max_valuations_monthly?: number;
    max_projects?: number;
    storage_gb?: number;
    target_audience?: string;
    features: string[];
    cta_text: string;
    is_featured: boolean;
    modules?: { module_slug: string; access_level: string }[];
}

// ============================================================
// Category Metadata
// ============================================================

const CATEGORY_META: Record<ServiceCategory, { label: string; description: string }> = {
    full_platform: {
        label: 'Full Platform',
        description: 'Complete real estate management suite — valuations, PM, CRM, data & more.',
    },
    valuation_services: {
        label: 'Valuation Services',
        description: 'Professional property valuations with automated reports, compliance tools, and market analytics.',
    },
    property_management: {
        label: 'Property Management',
        description: 'End-to-end property management with tenant portals and automated workflows.',
    },
    crm: {
        label: 'CRM & Deals',
        description: 'Pipeline management, client tracking, and deal flow automation.',
    },
    data_intelligence: {
        label: 'Data Intelligence',
        description: 'Market data API, analytics, and real-time property intelligence.',
    },
    project_management: {
        label: 'Project Management',
        description: 'Construction & development project tracking with budgets and timelines.',
    },
};

const CATEGORIES: ServiceCategory[] = [
    'full_platform', 'valuation_services', 'property_management', 'crm', 'data_intelligence', 'project_management',
];

// ============================================================
// Component
// ============================================================

export default function PricingPage() {
    const [category, setCategory] = useState<ServiceCategory>('full_platform');
    const [segment, setSegment] = useState<Segment>('all');
    const [billing, setBilling] = useState<BillingInterval>('monthly');
    const [plans, setPlans] = useState<Record<string, PlanData[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // Fetch plans from API
    useEffect(() => {
        async function fetchPlans() {
            try {
                const res = await fetch('/api/subscriptions/plans');
                if (res.ok) {
                    const data = await res.json();
                    if (data.grouped && Object.keys(data.grouped).length > 0) {
                        setPlans(data.grouped);
                    } else {
                        setError(true);
                    }
                } else {
                    setError(true);
                }
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        }
        fetchPlans();
    }, []);

    // Filter plans by segment
    const filteredPlans = useMemo(() => {
        const categoryPlans = plans[category] || [];
        if (segment === 'all') return categoryPlans;
        return categoryPlans.filter(p => p.segment === segment || p.segment === 'any');
    }, [plans, category, segment]);

    const getPrice = (plan: PlanData) => {
        if (billing === 'annual' && plan.price_annual_ghs) {
            return Math.round(plan.price_annual_ghs / 12);
        }
        return plan.price_monthly_ghs;
    };

    const getAnnualSavings = (plan: PlanData) => {
        if (!plan.price_annual_ghs) return 0;
        const monthlyTotal = plan.price_monthly_ghs * 12;
        return Math.round(((monthlyTotal - plan.price_annual_ghs) / monthlyTotal) * 100);
    };

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-6 py-24">
                {/* Hero */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-16"
                >
                    <h1 className="text-5xl md:text-6xl font-bold mb-4 font-mono">
                        Simple, transparent <span className="text-amber-500">pricing</span>
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
                        From independent agents to enterprise institutions — choose the plan that fits your scale.
                        Get full access the moment you subscribe.
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4 mb-8">
                        <button
                            onClick={() => setBilling('monthly')}
                            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
                                billing === 'monthly'
                                    ? 'bg-amber-500 text-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBilling('annual')}
                            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors relative ${
                                billing === 'annual'
                                    ? 'bg-amber-500 text-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Annual
                            <span className="absolute -top-3 -right-3 bg-green-500 text-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                Save 17%
                            </span>
                        </button>
                    </div>

                    {/* Segment Filter */}
                    <div className="flex items-center justify-center gap-2 mb-4">
                        {(['all', 'b2c', 'b2b'] as Segment[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setSegment(s)}
                                className={`px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider transition-colors ${
                                    segment === s
                                        ? 'bg-zinc-700 text-foreground border border-zinc-600'
                                        : 'text-muted-foreground hover:text-muted-foreground'
                                }`}
                            >
                                {s === 'all' ? 'All Plans' : s === 'b2c' ? 'Individual' : 'Business'}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Category Tabs */}
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                    {CATEGORIES.map(cat => {
                        const meta = CATEGORY_META[cat];
                        const isActive = category === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-mono transition-all ${
                                    isActive
                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                                        : 'bg-card text-muted-foreground border border-border hover:border-border hover:text-muted-foreground'
                                }`}
                            >
                                <span>{meta.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Category Description */}
                <motion.p
                    key={category}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-muted-foreground text-sm mb-10 max-w-xl mx-auto"
                >
                    {CATEGORY_META[category].description}
                </motion.p>

                {/* Pricing Cards */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${category}-${segment}-${billing}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
                    >
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="rounded-2xl bg-card/50 border border-border p-6 animate-pulse h-96" />
                            ))
                        ) : error || filteredPlans.length === 0 ? (
                            <div className="col-span-3 text-center py-16">
                                <p className="text-muted-foreground font-mono">Unable to load pricing. Please try again later.</p>
                            </div>
                        ) : filteredPlans.map((plan, idx) => {
                            const price = getPrice(plan);
                            const savings = getAnnualSavings(plan);
                            const isHighlighted = plan.is_featured;

                            return (
                                <motion.div
                                    key={plan.slug || idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className={`relative rounded-2xl p-6 flex flex-col ${
                                        isHighlighted
                                            ? 'bg-gradient-to-b from-amber-500/10 to-background border-2 border-amber-500/40 shadow-lg shadow-amber-500/5'
                                            : 'bg-card border border-border hover:border-border'
                                    }`}
                                >
                                    {/* Popular badge */}
                                    {isHighlighted && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                            <span className="bg-amber-500 text-foreground text-xs font-bold px-3 py-1 rounded-full font-mono">
                                                MOST POPULAR
                                            </span>
                                        </div>
                                    )}

                                    {/* Segment badge */}
                                    <div className="flex items-center justify-between mb-4">
                                        <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded ${
                                            plan.segment === 'b2c'
                                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                : plan.segment === 'b2b'
                                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                                : 'bg-muted text-muted-foreground'
                                        }`}>
                                            {plan.segment === 'b2c' ? 'Individual' : plan.segment === 'b2b' ? 'Business' : 'Any'}
                                        </span>
                                        {plan.tier === 'enterprise' && (
                                            <span className="text-[10px] font-mono text-muted-foreground">Custom pricing available</span>
                                        )}
                                    </div>

                                    {/* Plan name & target */}
                                    <h3 className="text-xl font-bold font-mono mb-1">{plan.name}</h3>
                                    <p className="text-muted-foreground text-sm mb-4">{plan.target_audience}</p>

                                    {/* Price */}
                                    <div className="mb-6">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold font-mono text-foreground">
                                                GHS {price.toLocaleString()}
                                            </span>
                                            <span className="text-muted-foreground text-sm">/month</span>
                                        </div>
                                        {billing === 'annual' && savings > 0 && (
                                            <p className="text-green-600 dark:text-green-400 text-xs mt-1 font-mono">
                                                Save {savings}% with annual billing — GHS {plan.price_annual_ghs?.toLocaleString()}/yr
                                            </p>
                                        )}
                                        {billing === 'monthly' && plan.price_annual_ghs && (
                                            <p className="text-muted-foreground text-xs mt-1">
                                                or GHS {Math.round(plan.price_annual_ghs / 12).toLocaleString()}/mo billed annually
                                            </p>
                                        )}
                                    </div>

                                    {/* Features */}
                                    <ul className="flex-1 space-y-2.5 mb-6">
                                        {plan.features.map((feature, fi) => (
                                            <li key={fi} className="flex items-start gap-2 text-sm">
                                                <svg className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span className="text-muted-foreground">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Limits summary */}
                                    {(plan.max_users || plan.max_properties || plan.max_api_calls_monthly || plan.max_projects) && (
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {plan.max_users && (
                                                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                    {plan.max_users} users
                                                </span>
                                            )}
                                            {plan.max_properties && (
                                                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                    {plan.max_properties} properties
                                                </span>
                                            )}
                                            {plan.max_api_calls_monthly && (
                                                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                    {(plan.max_api_calls_monthly / 1000).toFixed(0)}k API calls
                                                </span>
                                            )}
                                            {plan.max_valuations_monthly && (
                                                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                    {plan.max_valuations_monthly} valuations/mo
                                                </span>
                                            )}
                                            {plan.max_projects && (
                                                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                    {plan.max_projects} projects
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* CTA */}
                                    <Link
                                        href={`/signup?plan=${plan.slug}&category=${plan.category}&billing=${billing}`}
                                        className={`block text-center py-3 px-6 rounded-xl font-mono text-sm font-bold transition-all ${
                                            isHighlighted
                                                ? 'bg-amber-500 text-foreground hover:bg-amber-400'
                                                : 'bg-muted text-foreground hover:bg-zinc-700 border border-border'
                                        }`}
                                    >
                                        {plan.cta_text}
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>

                {/* À La Carte Section */}
                {category === 'full_platform' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-20 text-center"
                    >
                        <div className="border-t border-border pt-16">
                            <h3 className="text-2xl font-bold mb-3 font-mono">
                                Prefer à la carte? <span className="text-amber-500">Mix & match modules.</span>
                            </h3>
                            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                                Subscribe to the Full Platform or add individual modules to any plan.
                                Available as standalone subscriptions or add-ons to your base plan.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                                {([
                                    { cat: 'valuation_services' as ServiceCategory, label: 'Valuations', from: 325 },
                                    { cat: 'property_management' as ServiceCategory, label: 'Property Mgmt', from: 390 },
                                    { cat: 'crm' as ServiceCategory, label: 'CRM & Deals', from: 325 },
                                    { cat: 'project_management' as ServiceCategory, label: 'Project Mgmt', from: 325 },
                                    { cat: 'data_intelligence' as ServiceCategory, label: 'Data & API', from: 260 },
                                ]).map(mod => (
                                    <button
                                        key={mod.cat}
                                        onClick={() => setCategory(mod.cat)}
                                        className="bg-card border border-border hover:border-amber-500/30 rounded-xl p-4 text-left transition-all group"
                                    >
                                        <p className="font-mono text-sm font-bold group-hover:text-amber-500 transition-colors">
                                            {mod.label}
                                        </p>
                                        <p className="text-muted-foreground text-xs mt-1">
                                            From GHS {mod.from}/mo
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Comparison Table */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-20"
                >
                    <div className="border-t border-border pt-16">
                        <h3 className="text-2xl font-bold text-center mb-10 font-mono">
                            Compare {CATEGORY_META[category].label} Plans
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full max-w-4xl mx-auto text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-3 px-4 text-muted-foreground font-mono">Feature</th>
                                        {filteredPlans.map(plan => (
                                            <th key={plan.slug} className="text-center py-3 px-4 font-mono text-foreground">
                                                {plan.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-border">
                                        <td className="py-2.5 px-4 text-muted-foreground">Monthly Price</td>
                                        {filteredPlans.map(plan => (
                                            <td key={plan.slug} className="text-center py-2.5 px-4 font-mono text-amber-500">
                                                GHS {plan.price_monthly_ghs.toLocaleString()}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="border-b border-border">
                                        <td className="py-2.5 px-4 text-muted-foreground">Target</td>
                                        {filteredPlans.map(plan => (
                                            <td key={plan.slug} className="text-center py-2.5 px-4 text-muted-foreground text-xs">
                                                {plan.target_audience}
                                            </td>
                                        ))}
                                    </tr>
                                    {filteredPlans.some(p => p.max_users !== undefined) && (
                                        <tr className="border-b border-border">
                                            <td className="py-2.5 px-4 text-muted-foreground">User Seats</td>
                                            {filteredPlans.map(plan => (
                                                <td key={plan.slug} className="text-center py-2.5 px-4 text-muted-foreground">
                                                    {plan.max_users ? plan.max_users : 'Unlimited'}
                                                </td>
                                            ))}
                                        </tr>
                                    )}
                                    {(() => {
                                        const allFeatures = [...new Set(filteredPlans.flatMap(p => p.features))];
                                        return allFeatures.slice(0, 8).map(feature => (
                                            <tr key={feature} className="border-b border-border">
                                                <td className="py-2 px-4 text-muted-foreground text-xs">{feature}</td>
                                                {filteredPlans.map(plan => (
                                                    <td key={plan.slug} className="text-center py-2 px-4">
                                                        {plan.features.includes(feature) ? (
                                                            <svg className="w-4 h-4 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <span className="text-zinc-700">—</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </motion.div>

                {/* Custom / Enterprise CTA */}
                <div className="mt-24 text-center border-t border-border pt-16">
                    <h3 className="text-2xl font-bold mb-3 font-mono">Need a custom solution?</h3>
                    <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
                        For government agencies, international entities, and institutions requiring
                        custom integrations, regional rollouts, or volume licensing.
                    </p>
                    <p className="text-muted-foreground text-sm mb-8">
                        Full access from day one • Secure Paystack checkout • Cancel anytime
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <Link
                            href="/contact"
                            className="text-amber-500 font-bold font-mono hover:underline"
                        >
                            Contact our Enterprise Team →
                        </Link>
                        <span className="text-zinc-700">|</span>
                        <Link
                            href="/signup"
                            className="bg-amber-500 text-foreground px-6 py-2.5 rounded-xl font-mono font-bold text-sm hover:bg-amber-400 transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
