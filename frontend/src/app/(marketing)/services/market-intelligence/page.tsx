'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import MarketTrendsVisual from '@/components/marketing/motion/MarketTrendsVisual';
import GhanaMapVisual from '@/components/marketing/motion/GhanaMapVisual';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import { TrendingUp, FileText, BarChart, Target, Globe, Lightbulb, CheckCircle2 } from 'lucide-react';

export default function MarketIntelligencePage() {
    const capabilities = [
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'Market Trend Analysis',
            description: 'Identify emerging opportunities and market shifts with quarterly indices across Ghana\'s major cities.',
        },
        {
            icon: <FileText className="w-6 h-6" />,
            title: 'Research Reports',
            description: 'Quarterly market reports covering residential, commercial, and land sectors with actionable insight.',
        },
        {
            icon: <BarChart className="w-6 h-6" />,
            title: 'Investment Analytics',
            description: 'Rental yields, cap rates, IRR projections, and comparable transaction benchmarking.',
        },
        {
            icon: <Target className="w-6 h-6" />,
            title: 'Custom Research',
            description: 'Bespoke research projects tailored to your specific investment thesis or development plan.',
        },
        {
            icon: <Globe className="w-6 h-6" />,
            title: 'Regional Benchmarking',
            description: 'Compare Ghana markets against Nigeria, Côte d\'Ivoire, and Kenya for cross-border strategy.',
        },
        {
            icon: <Lightbulb className="w-6 h-6" />,
            title: 'Forecasting Models',
            description: 'AI-powered price and demand forecasts using macroeconomic, demographic, and transaction data.',
        },
    ];

    const reports = [
        {
            title: 'Residential Market Report',
            description: 'Comprehensive analysis of residential property markets across Ghana.',
            features: [
                'Price trends by location and property type',
                'Supply and demand analysis',
                'Rental yield calculations',
                'Market outlook and forecasts',
            ],
        },
        {
            title: 'Commercial Market Report',
            description: 'Office, retail, and industrial market intelligence for investors.',
            features: [
                'Vacancy rates and absorption',
                'Rental rates and capital values',
                'Development pipeline tracking',
                'Investor activity and transaction volumes',
            ],
        },
        {
            title: 'Land Market Report',
            description: 'Undeveloped land pricing, availability, and development potential.',
            features: [
                'Land values by region and use',
                'Development potential analysis',
                'Infrastructure impact assessment',
                'Regulatory environment updates',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Define Scope',
            description: 'Tell us the markets, asset classes, and metrics that matter to your strategy.',
        },
        {
            title: 'Research & Analysis',
            description: 'Our analysts combine market data with on-the-ground intelligence.',
        },
        {
            title: 'Review & Deliver',
            description: 'Receive beautifully formatted reports via dashboard, PDF, or API feed.',
        },
        {
            title: 'Ongoing Updates',
            description: 'Stay current with quarterly refreshes and real-time market alerts.',
        },
    ];

    return (
        <main>
            {/* ====== Hero ====== */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-background">
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1920&q=80"
                            alt="Market intelligence"
                            className="w-full h-full object-cover opacity-15"
                        />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/70" />
                </div>

                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-4xl"
                    >
                        <div className="inline-block px-3 py-1 mb-6 border border-primary/50 rounded-full text-xs font-medium tracking-wider uppercase bg-primary/10 text-primary">
                            Market Intelligence
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-foreground">
                            Data-Driven Insights for{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Confident Decisions
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mb-12">
                            Stay ahead of Ghana&apos;s dynamic real estate market with institutional-grade research, analytics, and trend forecasting.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
                            <div className="border border-border rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground text-center">Quarterly reports</div>
                            <div className="border border-border rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground text-center">Price & yield indices</div>
                            <div className="border border-border rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground text-center">Interactive dashboards</div>
                            <div className="border border-border rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground text-center">API data feeds</div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=market_intelligence">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Subscribe Now
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=market_intelligence">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-border text-foreground font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    View Pricing
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ====== Market Trends Visual ====== */}
            <section className="py-24 bg-card">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
                            Real-Time Market Trends
                        </h2>
                        <p className="text-lg text-muted-foreground">
                            Live tracking of pricing movements, transaction volumes, and market sentiment.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <MarketTrendsVisual />
                    </motion.div>
                </div>
            </section>

            {/* ====== Capabilities ====== */}
            <section className="py-24 bg-background">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                            Comprehensive Market Intelligence
                        </h2>
                        <p className="text-xl text-muted-foreground">
                            Everything you need to understand Ghana&apos;s real estate markets.
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
                                className="bg-card border border-border rounded-lg p-8 hover:border-primary/50 transition-colors group"
                            >
                                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                                    {cap.icon}
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-3">{cap.title}</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">{cap.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== Split — Insights Preview ====== */}
            <section className="py-24 bg-card">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                                Intelligence That{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Moves Markets
                                </span>
                            </h2>
                            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                                Our research team combines verified data with on-the-ground intelligence to deliver insights you won&apos;t find anywhere else.
                            </p>
                            <div className="space-y-4">
                                {[
                                    'Quarterly price indices across major cities',
                                    'Rental yield benchmarks by neighbourhood',
                                    'Development pipeline and absorption forecasts',
                                    'Macroeconomic impact analysis on real estate',
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
                                        <span className="text-muted-foreground text-sm">{item}</span>
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
                            <GhanaMapVisual />
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ====== Research Reports (Use Cases) ====== */}
            <section className="py-24 bg-background">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                            Our Research Reports
                        </h2>
                        <p className="text-xl text-muted-foreground">
                            In-depth analysis and insights published quarterly.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {reports.map((report, index) => (
                            <motion.div
                                key={report.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-card border border-border rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <h3 className="text-2xl font-bold text-foreground mb-3">{report.title}</h3>
                                <p className="text-muted-foreground mb-6 text-sm">{report.description}</p>
                                <ul className="space-y-3">
                                    {report.features.map((feat, fi) => (
                                        <li key={fi} className="flex items-start gap-2 text-sm text-muted-foreground">
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
            <section className="py-24 bg-card">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                            How It Works
                        </h2>
                        <p className="text-xl text-muted-foreground">
                            From scoping to ongoing intelligence in four steps.
                        </p>
                    </motion.div>
                    <ProcessTimeline steps={timeline} />
                </div>
            </section>

            {/* ====== Pricing Teaser ====== */}
            <section className="py-24 bg-background">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                            Intelligence Plans
                        </h2>
                        <p className="text-xl text-muted-foreground">
                            From individual analysts to institutional research teams.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Analyst',
                                price: 'GHS 250',
                                audience: 'Researchers & agents',
                                features: ['Quarterly reports (PDF)', '1 city coverage', 'Email alerts', 'Basic dashboard', 'Email support'],
                            },
                            {
                                tier: 'Professional',
                                price: 'GHS 800',
                                audience: 'Firms & funds',
                                features: ['All reports + custom briefs', 'All major cities', 'Interactive dashboard', 'API data feed', 'Priority support', 'Excel export'],
                                featured: true,
                            },
                            {
                                tier: 'Enterprise',
                                price: 'GHS 3,000',
                                audience: 'Banks & institutions',
                                features: ['Everything in Professional', 'Bespoke research projects', 'Analyst consultation hours', 'White-label reports', 'Board-ready presentations', 'Dedicated account manager'],
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
                                        ? 'bg-card border-primary/50 ring-1 ring-primary/20'
                                        : 'bg-card border-border hover:border-border'
                                }`}
                            >
                                {plan.featured && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-zinc-950 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                        Most Popular
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{plan.audience}</div>
                                <h3 className="text-2xl font-bold text-foreground mb-1">{plan.tier}</h3>
                                <div className="text-3xl font-bold text-foreground mb-1">
                                    {plan.price}
                                    <span className="text-sm text-muted-foreground font-normal"> /month</span>
                                </div>
                                <ul className="mt-6 space-y-3">
                                    {plan.features.map((f, fi) => (
                                        <li key={fi} className="flex items-start gap-2 text-sm text-muted-foreground">
                                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link href={`/signup?plan=intelligence-${plan.tier.toLowerCase()}&category=market_intelligence`}>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`w-full mt-8 py-3 font-bold uppercase tracking-wider text-sm transition-colors ${
                                            plan.featured
                                                ? 'bg-gradient-to-r from-primary to-yellow-400 text-zinc-950'
                                                : 'border border-border text-foreground hover:border-primary hover:text-primary'
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
                title="Get the Intelligence Edge"
                description="Join Ghana's leading investors, banks, and developers who rely on PROPMETRIK for market-leading intelligence."
                primaryCTA={{
                    text: 'Subscribe Now',
                    href: '/signup?category=market_intelligence',
                }}
                secondaryCTA={{
                    text: 'View Pricing',
                    href: '/pricing?category=market_intelligence',
                }}
                backgroundImage="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1920&q=80"
            />
        </main>
    );
}
