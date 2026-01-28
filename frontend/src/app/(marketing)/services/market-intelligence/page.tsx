'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import PropertyShowcase from '@/components/marketing/motion/PropertyShowcase';
import GhanaMapVisual from '@/components/marketing/motion/GhanaMapVisual';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import { TrendingUp, FileText, BarChart, Target, CheckCircle2 } from 'lucide-react';

export default function MarketIntelligencePage() {
    const features = [
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'Market Trend Analysis',
            description: 'Identify emerging opportunities and market shifts before your competition'
        },
        {
            icon: <FileText className="w-6 h-6" />,
            title: 'Research Reports',
            description: 'Quarterly market reports covering all major Ghanaian cities'
        },
        {
            icon: <BarChart className="w-6 h-6" />,
            title: 'Investment Analytics',
            description: 'Data-driven insights to evaluate and compare investment opportunities'
        },
        {
            icon: <Target className="w-6 h-6" />,
            title: 'Custom Research',
            description: 'Bespoke research projects tailored to your specific needs'
        },
    ];

    const reports = [
        {
            title: 'Residential Market Report',
            description: 'Comprehensive analysis of residential property markets',
            frequency: 'Quarterly',
            includes: [
                'Price trends by location and property type',
                'Supply and demand analysis',
                'Rental yield calculations',
                'Market outlook and forecasts',
            ]
        },
        {
            title: 'Commercial Market Report',
            description: 'Office, retail, and industrial market intelligence',
            frequency: 'Quarterly',
            includes: [
                'Vacancy rates and absorption',
                'Rental rates and capital values',
                'Development pipeline tracking',
                'Investor activity and transaction volumes',
            ]
        },
        {
            title: 'Land Market Report',
            description: 'Undeveloped land pricing and availability',
            frequency: 'Semi-Annual',
            includes: [
                'Land values by region and use',
                'Development potential analysis',
                'Infrastructure impact assessment',
                'Regulatory environment updates',
            ]
        },
    ];

    return (
        <main>
            {/* Hero Section */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1920&q=80"
                        alt="Market intelligence"
                        className="w-full h-full object-cover opacity-20"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-zinc-950/70" />
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
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Data-Driven Insights for{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Confident Decisions
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            Stay ahead of Ghana's dynamic real estate market with institutional-grade research, analytics, and trend forecasting.
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 mb-12">
                            <StatsCounter value={48} label="Quarterly Reports" />
                            <StatsCounter value={12} label="Markets Covered" />
                            <StatsCounter value={300} label="Subscribers" suffix="+" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Subscribe Now
                                </motion.button>
                            </Link>
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    Request Sample
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Property Showcase */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <PropertyShowcase
                        imageUrl="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80"
                        stats={[
                            { label: 'Reports Published', value: '48' },
                            { label: 'Markets Tracked', value: '12' },
                            { label: 'Data Points', value: '50K+' }
                        ]}
                    />
                </div>
            </section>

            {/* Features */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Comprehensive Market Intelligence
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Everything you need to understand Ghana's real estate markets
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                whileHover={{ y: -5 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4">
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                <p className="text-zinc-400">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Ghana Map Coverage */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Markets We Cover
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive coverage across Ghana's major real estate markets
                        </p>
                    </motion.div>

                    <GhanaMapVisual />
                </div>
            </section>

            {/* Research Reports */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Our Research Reports
                        </h2>
                        <p className="text-xl text-zinc-400">
                            In-depth analysis and insights published regularly
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {reports.map((report, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-8"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">{report.title}</h3>
                                    <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                        {report.frequency}
                                    </div>
                                </div>

                                <p className="text-zinc-400 mb-6">{report.description}</p>

                                <div className="space-y-2">
                                    {report.includes.map((item, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <PremiumCTASection
                title="Get the Intelligence Edge"
                description="Join Ghana's leading investors, banks, and developers who rely on PropMetrik for market-leading intelligence."
                primaryCTA={{
                    text: "Subscribe Now",
                    href: "/signup"
                }}
                secondaryCTA={{
                    text: "Request Sample",
                    href: "/contact"
                }}
                backgroundImage="https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1920&q=80"
            />
        </main>
    );
}
