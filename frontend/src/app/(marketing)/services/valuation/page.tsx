'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import ValuationScanner from '@/components/marketing/motion/ValuationScanner';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import { TrendingUp, Shield, Zap, CheckCircle2, Brain, Globe, FileCheck } from 'lucide-react';

export default function ValuationServicePage() {
    const capabilities = [
        {
            icon: <Brain className="w-6 h-6" />,
            title: 'AI-Powered Accuracy',
            description: 'Machine learning models trained on verified Ghanaian property transactions deliver institutional-grade precision.',
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'Expert-Reviewed',
            description: 'Every valuation is reviewed by qualified valuation professionals before delivery.',
        },
        {
            icon: <Zap className="w-6 h-6" />,
            title: 'Rapid Turnaround',
            description: 'Preliminary valuations in minutes, full valuation reports within 24–48 hours. No more 2-week waits.',
        },
        {
            icon: <Globe className="w-6 h-6" />,
            title: 'National Coverage',
            description: 'Greater Accra, Kumasi, Takoradi, Tamale, Cape Coast — with nationwide rollout planned.',
        },
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'Confidence Intervals',
            description: 'Every valuation includes statistical confidence bands so you know exactly how tight the estimate is.',
        },
        {
            icon: <FileCheck className="w-6 h-6" />,
            title: 'Report Library',
            description: 'Branded PDF reports, mortgage-ready formats, and bulk CSV exports for portfolio clients.',
        },
    ];

    const useCases = [
        {
            title: 'Automated Valuation Models',
            description: 'Instant AI-driven estimates for residential and commercial properties.',
            features: [
                'Instant estimates with confidence intervals',
                'Residential & commercial support',
                'Coverage across all major cities',
                'API access for bulk valuations',
            ],
        },
        {
            title: 'Portfolio Revaluation',
            description: 'Batch processing for institutional investors and fund managers.',
            features: [
                'Bulk property revaluation',
                'Real-time performance tracking',
                'Market index benchmarking',
                'Quarterly scheduling & alerts',
            ],
        },
        {
            title: 'Development Appraisal',
            description: 'Feasibility studies for new construction and redevelopment.',
            features: [
                'Residual land value calculations',
                'Construction cost analysis',
                'Absorption rate modelling',
                'NPV & IRR projections',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Submit Property Details',
            description: 'Upload location, size, photos, and features via our web portal or API.',
        },
        {
            title: 'AI-Powered Analysis',
            description: 'Our algorithms analyse Ghana market data in seconds.',
        },
        {
            title: 'Expert Verification',
            description: 'Qualified valuers review and validate the AI assessment.',
        },
        {
            title: 'Receive Your Report',
            description: 'Download a detailed valuation with confidence intervals and market context.',
        },
    ];

    return (
        <main>
            {/* ====== Hero ====== */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1920&q=80"
                            alt="Property valuation"
                            className="w-full h-full object-cover opacity-15"
                        />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-zinc-950/70" />
                </div>

                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-4xl"
                    >
                        <div className="inline-block px-3 py-1 mb-6 border border-primary/50 rounded-full text-xs font-medium tracking-wider uppercase bg-primary/10 text-primary">
                            Valuation & Advisory
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Confident Valuations for{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Ghana&apos;s Real Estate
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            Leverage AI and verified local market data — with every valuation reviewed by a qualified valuation professional — built for banks, insurers, and developers across Ghana.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
                            <div className="border border-zinc-800 rounded-lg px-4 py-3 text-sm font-medium text-zinc-300 text-center">Professionally reviewed</div>
                            <div className="border border-zinc-800 rounded-lg px-4 py-3 text-sm font-medium text-zinc-300 text-center">AI + expert review</div>
                            <div className="border border-zinc-800 rounded-lg px-4 py-3 text-sm font-medium text-zinc-300 text-center">Mortgage-ready reports</div>
                            <div className="border border-zinc-800 rounded-lg px-4 py-3 text-sm font-medium text-zinc-300 text-center">API access</div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=valuation">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Request Valuation
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=valuation">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    View Pricing
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ====== Valuation Scanner Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            Watch the AI at Work
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Our valuation engine scans location, comparables, and market trends in real time.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <ValuationScanner />
                    </motion.div>
                </div>
            </section>

            {/* ====== Capabilities ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Why PROPMETRIK Valuations
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Technology meets expertise — an AI-powered valuation platform built for Ghana.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {capabilities.map((cap, index) => (
                            <motion.div
                                key={cap.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.08 }}
                                whileHover={{ y: -5 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors group"
                            >
                                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                                    {cap.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">{cap.title}</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed">{cap.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== Split Visual — How AI Works ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Institutional-Grade{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Precision
                                </span>
                            </h2>
                            <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                                Our AI cross-references verified transactions, construction costs, and neighbourhood trends — then a qualified valuer signs off before the report reaches you.
                            </p>
                            <div className="space-y-4">
                                {[
                                    'Comparable sales within 500m radius weighted by recency',
                                    'Construction cost adjustments for finish quality & age',
                                    'Neighbourhood growth trajectory & infrastructure impact',
                                    'Statistical confidence band on every estimate',
                                ].map((item, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 + i * 0.1 }}
                                        className="flex items-start gap-3"
                                    >
                                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                        <span className="text-zinc-300 text-sm">{item}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="relative"
                        >
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8">
                                <div className="space-y-6">
                                    {[
                                        { label: 'Location Score', value: 92, color: 'bg-emerald-500' },
                                        { label: 'Comparable Strength', value: 88, color: 'bg-blue-500' },
                                        { label: 'Market Trend', value: 76, color: 'bg-amber-500' },
                                        { label: 'Confidence Level', value: 95, color: 'bg-primary' },
                                    ].map((metric, i) => (
                                        <div key={metric.label}>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-zinc-400">{metric.label}</span>
                                                <span className="text-white font-mono font-bold">{metric.value}%</span>
                                            </div>
                                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    whileInView={{ width: `${metric.value}%` }}
                                                    viewport={{ once: true }}
                                                    transition={{ duration: 1.2, delay: 0.3 + i * 0.15 }}
                                                    className={`h-full rounded-full ${metric.color}`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
                                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Estimated Value</div>
                                    <div className="text-3xl font-bold text-white">GHS 1,250,000</div>
                                    <div className="text-xs text-zinc-500 mt-1">± 4.8% confidence band</div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ====== Use Cases ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Valuation Services
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive solutions for every valuation need — from single properties to entire portfolios.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {useCases.map((uc, index) => (
                            <motion.div
                                key={uc.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <h3 className="text-2xl font-bold text-white mb-3">{uc.title}</h3>
                                <p className="text-zinc-400 mb-6 text-sm">{uc.description}</p>
                                <ul className="space-y-3">
                                    {uc.features.map((feat, fi) => (
                                        <li key={fi} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                            <span>{feat}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== How It Works ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            How It Works
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Simple, transparent process from request to report.
                        </p>
                    </motion.div>
                    <ProcessTimeline steps={timeline} />
                </div>
            </section>

            {/* ====== Pricing Teaser ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Transparent Pricing
                        </h2>
                        <p className="text-xl text-zinc-400">
                            From single valuations to enterprise-scale portfolios.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Standard',
                                price: 'GHS 350',
                                audience: 'Individual owners',
                                features: ['Single property valuation', 'AI + expert review', '48-hour delivery', 'PDF report', 'Email support'],
                            },
                            {
                                tier: 'Professional',
                                price: 'GHS 750',
                                audience: 'Agents & firms',
                                features: ['Up to 20 valuations/month', 'Priority 24h turnaround', 'Branded report templates', 'Comparable data access', 'API access', 'Dedicated account manager'],
                                featured: true,
                            },
                            {
                                tier: 'Enterprise',
                                price: 'GHS 2,500',
                                audience: 'Banks & institutions',
                                features: ['Unlimited valuations', 'Bulk portfolio revaluation', 'Custom report formats', 'SLA guarantee', 'White-label option', 'Direct API pipeline', 'Quarterly reviews'],
                            },
                        ].map((plan, i) => (
                            <motion.div
                                key={plan.tier}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className={`relative rounded-xl p-8 border transition-colors ${
                                    plan.featured
                                        ? 'bg-zinc-900 border-primary/50 ring-1 ring-primary/20'
                                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                                }`}
                            >
                                {plan.featured && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-zinc-950 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                        Most Popular
                                    </div>
                                )}
                                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{plan.audience}</div>
                                <h3 className="text-2xl font-bold text-white mb-1">{plan.tier}</h3>
                                <div className="text-3xl font-bold text-white mb-1">
                                    {plan.price}
                                    <span className="text-sm text-zinc-500 font-normal"> /month</span>
                                </div>
                                <ul className="mt-6 space-y-3">
                                    {plan.features.map((f, fi) => (
                                        <li key={fi} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link href={`/signup?plan=val-${plan.tier.toLowerCase()}&category=valuation`}>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`w-full mt-8 py-3 font-bold uppercase tracking-wider text-sm transition-colors ${
                                            plan.featured
                                                ? 'bg-gradient-to-r from-primary to-yellow-400 text-zinc-950'
                                                : 'border border-zinc-700 text-white hover:border-primary hover:text-primary'
                                        }`}
                                    >
                                        Get Started
                                    </motion.button>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== CTA ====== */}
            <PremiumCTASection
                title="Ready to Get an Accurate Valuation?"
                description="Get reliable, AI-powered property valuations built for the Ghanaian market with PROPMETRIK."
                primaryCTA={{
                    text: 'Request Valuation',
                    href: '/signup?category=valuation',
                }}
                secondaryCTA={{
                    text: 'View Pricing',
                    href: '/pricing?category=valuation',
                }}
                backgroundImage="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80"
            />
        </main>
    );
}
