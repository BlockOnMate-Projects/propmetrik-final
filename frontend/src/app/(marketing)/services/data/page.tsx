'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import DataStreamVisual from '@/components/marketing/motion/DataStreamVisual';
import GhanaMapVisual from '@/components/marketing/motion/GhanaMapVisual';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import { Database, MapPin, TrendingUp, Shield, Code, LineChart, CheckCircle2 } from 'lucide-react';

export default function DataServicePage() {
    const capabilities = [
        {
            icon: <Database className="w-6 h-6" />,
            title: '50,000+ Data Points',
            description: 'Verified property transactions across residential, commercial, and land sectors — the largest dataset in West Africa.',
        },
        {
            icon: <MapPin className="w-6 h-6" />,
            title: 'Hyperlocal Coverage',
            description: 'Micro-location data for Accra, Kumasi, Takoradi, Tamale, Cape Coast, and 7 more cities.',
        },
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'Real-Time Updates',
            description: 'Weekly refreshed market indices and construction cost data — never stale, always actionable.',
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'Verified & Standardised',
            description: 'Every data point verified by our team against multiple sources. No self-reported guesswork.',
        },
        {
            icon: <Code className="w-6 h-6" />,
            title: 'Developer-Ready API',
            description: 'RESTful endpoints with JSON responses, API key auth, and SDKs for Python, JavaScript & PHP.',
        },
        {
            icon: <LineChart className="w-6 h-6" />,
            title: 'Market Analytics',
            description: 'Price indices, rental yields, absorption rates, and investment heatmaps across all asset classes.',
        },
    ];

    const datasets = [
        {
            title: 'Market Comparables',
            description: 'Verified sold and rented properties with detailed characteristics.',
            features: [
                'Sold & rental comparables with full specs',
                'Property characteristics (size, finish, amenities)',
                'Micro-location mapping & neighbourhood profiles',
                'Historical price trends going back 5 years',
            ],
        },
        {
            title: 'Construction Cost Index',
            description: 'Weekly updated material and labour costs for accurate budgeting.',
            features: [
                'Material costs (cement, steel, tiles, etc.)',
                'Labour rates by trade and region',
                'Regional cost variations across 5 zones',
                'Historical inflation tracking & forecasts',
            ],
        },
        {
            title: 'Land Title Verification',
            description: 'Integration with Ghana Lands Commission for ownership checks.',
            features: [
                'Ownership verification in real time',
                'Encumbrance & lien checks',
                'Plot boundary verification',
                'Title document retrieval',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Choose Your Dataset',
            description: 'Select from comparables, construction costs, land titles, or the full platform.',
        },
        {
            title: 'Connect via API or Dashboard',
            description: 'Use our web dashboard for exploration or connect programmatically with a single API key.',
        },
        {
            title: 'Query & Analyse',
            description: 'Filter by location, property type, date range, and 30+ attributes. Export CSV or consume JSON.',
        },
        {
            title: 'Integrate & Automate',
            description: 'Pipe data into your valuation models, dashboards, or applications with webhooks and batch endpoints.',
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
                            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&q=80"
                            alt="Data analytics"
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
                            Data Intelligence
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Ghana&apos;s Most Comprehensive{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Real Estate Data
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            The single source of truth for West African property data. 50,000+ verified transactions, standardised, and accessible via dashboard or API.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
                            <StatsCounter value={50000} label="Data Points" suffix="+" />
                            <StatsCounter value={12} label="Cities Covered" />
                            <StatsCounter value={200} label="Cost Indices" suffix="+" />
                            <StatsCounter value={99.5} label="Uptime SLA" suffix="%" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=data">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Access Data Hub
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=data">
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

            {/* ====== Data Stream Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            Live Data Pipeline
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Watch real-time market data flow through our verification and standardisation engine.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <DataStreamVisual />
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
                            Why PROPMETRIK Data
                        </h2>
                        <p className="text-xl text-zinc-400">
                            The most reliable, comprehensive, and accessible real estate data for Ghana.
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

            {/* ====== Split — API Access ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Powerful API for{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Developers
                                </span>
                            </h2>
                            <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                                Integrate Ghana&apos;s best real estate data into your applications in minutes. RESTful endpoints, comprehensive docs, and webhooks for real-time updates.
                            </p>
                            <div className="space-y-4">
                                {[
                                    'RESTful endpoints with JSON responses',
                                    'Authentication via API keys — no OAuth complexity',
                                    'Rate limiting: 1,000 requests/hour (Enterprise: unlimited)',
                                    'SDKs for Python, JavaScript, and PHP',
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
                        >
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                    <span className="ml-2 text-[10px] font-mono text-zinc-600">api-request.sh</span>
                                </div>
                                <div className="bg-zinc-900 rounded-lg p-5 font-mono text-sm space-y-1 overflow-x-auto">
                                    <div className="text-green-400">GET <span className="text-zinc-300">/api/v1/properties/comparables</span></div>
                                    <div className="text-zinc-600 mt-3">// Response</div>
                                    <div className="text-zinc-400">{'{'}</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;location&quot;</span>: <span className="text-yellow-400">&quot;East Legon, Accra&quot;</span>,</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;property_type&quot;</span>: <span className="text-yellow-400">&quot;Residential&quot;</span>,</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;bedrooms&quot;</span>: <span className="text-purple-400">4</span>,</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;avg_price_per_sqm&quot;</span>: <span className="text-purple-400">3500</span>,</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;currency&quot;</span>: <span className="text-yellow-400">&quot;GHS&quot;</span>,</div>
                                    <div className="pl-4"><span className="text-blue-400">&quot;confidence&quot;</span>: <span className="text-purple-400">0.94</span></div>
                                    <div className="text-zinc-400">{'}'}</div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ====== Ghana Map Coverage ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            National Coverage
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive data across Ghana&apos;s major real estate markets.
                        </p>
                    </motion.div>
                    <GhanaMapVisual />
                </div>
            </section>

            {/* ====== Datasets / Use Cases ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Our Datasets
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive coverage for every real estate data need.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {datasets.map((ds, index) => (
                            <motion.div
                                key={ds.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-950 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <h3 className="text-2xl font-bold text-white mb-3">{ds.title}</h3>
                                <p className="text-zinc-400 mb-6 text-sm">{ds.description}</p>
                                <ul className="space-y-3">
                                    {ds.features.map((feat, fi) => (
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
            <section className="py-24 bg-zinc-950">
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
                            From dataset selection to live integration in four steps.
                        </p>
                    </motion.div>
                    <ProcessTimeline steps={timeline} />
                </div>
            </section>

            {/* ====== Pricing Teaser ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Data Plans for Every Scale
                        </h2>
                        <p className="text-xl text-zinc-400">
                            From individual researchers to enterprise pipelines.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Explorer',
                                price: 'GHS 150',
                                audience: 'Researchers & students',
                                features: ['Dashboard access', '100 queries/month', 'Comparables dataset', 'CSV export', 'Email support'],
                            },
                            {
                                tier: 'Professional',
                                price: 'GHS 600',
                                audience: 'Firms & valuers',
                                features: ['Full API access', '2,000 queries/month', 'All 3 datasets', 'Webhooks', 'Python & JS SDKs', 'Priority support'],
                                featured: true,
                            },
                            {
                                tier: 'Enterprise',
                                price: 'GHS 2,000',
                                audience: 'Banks & institutions',
                                features: ['Unlimited queries', 'Dedicated endpoint', 'Custom datasets', 'Bulk batch API', 'SLA guarantee', 'Dedicated engineer', 'White-label option'],
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
                                        ? 'bg-zinc-950 border-primary/50 ring-1 ring-primary/20'
                                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
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
                                <Link href={`/signup?plan=data-${plan.tier.toLowerCase()}&category=data`}>
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
                title="Start Accessing Ghana's Best Real Estate Data"
                description="Join leading banks, developers, and investors who rely on PROPMETRIK data for confident decision-making."
                primaryCTA={{
                    text: 'Get Started',
                    href: '/signup?category=data',
                }}
                secondaryCTA={{
                    text: 'View Pricing',
                    href: '/pricing?category=data',
                }}
                backgroundImage="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&q=80"
            />
        </main>
    );
}
