'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import DataStreamVisual from '@/components/marketing/motion/DataStreamVisual';
import GhanaMapVisual from '@/components/marketing/motion/GhanaMapVisual';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import { Database, MapPin, TrendingUp, Shield, Code, LineChart } from 'lucide-react';

export default function DataServicePage() {
    const features = [
        {
            icon: <Database className="w-6 h-6" />,
            title: '50,000+ Data Points',
            description: 'Verified property transactions across residential, commercial, and land sectors'
        },
        {
            icon: <MapPin className="w-6 h-6" />,
            title: 'Hyperlocal Coverage',
            description: 'Micro-location data for Accra, Kumasi, Takoradi, and major urban centers'
        },
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'Real-Time Updates',
            description: 'Weekly refreshed market indices and construction cost data'
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'Verified & Standardized',
            description: 'Every data point verified by our team against multiple sources'
        },
        {
            icon: <Code className="w-6 h-6" />,
            title: 'API Access',
            description: 'RESTful API for seamless integration into your applications'
        },
        {
            icon: <LineChart className="w-6 h-6" />,
            title: 'Market Analytics',
            description: 'Trend analysis, price indices, and investment insights'
        },
    ];

    const datasets = [
        {
            title: 'Market Comparables',
            description: 'Verified sold and rented properties with detailed characteristics',
            metrics: [
                { label: 'Properties', value: '50,000+' },
                { label: 'Cities Covered', value: '12' },
                { label: 'Update Frequency', value: 'Weekly' },
            ],
            features: [
                'Sold and rental comparables',
                'Property characteristics (size, finish, amenities)',
                'Micro-location mapping',
                'Historical price trends',
            ]
        },
        {
            title: 'Construction Cost Index',
            description: 'Weekly updated material and labor costs for accurate budgeting',
            metrics: [
                { label: 'Materials Tracked', value: '200+' },
                { label: 'Regions', value: '5' },
                { label: 'Update Frequency', value: 'Weekly' },
            ],
            features: [
                'Material costs (cement, steel, tiles, etc.)',
                'Labor rates by trade',
                'Regional cost variations',
                'Historical inflation tracking',
            ]
        },
        {
            title: 'Land Title Verification',
            description: 'Integration with Ghana Lands Commission (Phase 2)',
            metrics: [
                { label: 'Status', value: 'Q2 2026' },
                { label: 'Coverage', value: 'National' },
                { label: 'Response Time', value: 'Real-time' },
            ],
            features: [
                'Ownership verification',
                'Encumbrance checks',
                'Plotting verification',
                'Title document retrieval',
            ]
        },
    ];

    return (
        <main>
            {/* Hero Section */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&q=80"
                        alt="Data analytics"
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
                            Data Intelligence
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Ghana's Most Comprehensive{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Real Estate Data Platform
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            The single source of truth for West African real estate data. 50,000+ verified transactions, standardized, and accessible via API.
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 mb-12">
                            <StatsCounter value={50000} label="Data Points" suffix="+" />
                            <StatsCounter value={12} label="Cities Covered" />
                            <StatsCounter value={200} label="Cost Indices" suffix="+" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Access Data Hub
                                </motion.button>
                            </Link>
                            <Link href="/pricing">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    API Documentation
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Data Stream Visual */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <DataStreamVisual />
                </div>
            </section>

            {/* Features Grid */}
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
                            The most reliable, comprehensive, and accessible real estate data for Ghana
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                whileHover={{ y: -5 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors"
                            >
                                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4">
                                    {feature.icon}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                                <p className="text-sm text-zinc-400">{feature.description}</p>
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
                            National Coverage
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive data across Ghana's major real estate markets
                        </p>
                    </motion.div>

                    <GhanaMapVisual />
                </div>
            </section>

            {/* Datasets */}
            <section className="py-24 bg-zinc-950">
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
                            Comprehensive data coverage for every real estate need
                        </p>
                    </motion.div>

                    <div className="space-y-8">
                        {datasets.map((dataset, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
                            >
                                <div className="grid lg:grid-cols-3 gap-8 p-8">
                                    <div className="lg:col-span-1">
                                        <h3 className="text-2xl font-bold text-white mb-3">{dataset.title}</h3>
                                        <p className="text-zinc-400 mb-6">{dataset.description}</p>

                                        <div className="grid grid-cols-3 lg:grid-cols-1 gap-4">
                                            {dataset.metrics.map((metric, idx) => (
                                                <div key={idx} className="bg-zinc-950 rounded p-3">
                                                    <div className="text-sm text-zinc-500 mb-1">{metric.label}</div>
                                                    <div className="text-lg font-bold text-primary">{metric.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <h4 className="text-lg font-bold text-white mb-4">Includes:</h4>
                                        <div className="grid md:grid-cols-2 gap-3">
                                            {dataset.features.map((feature, idx) => (
                                                <div key={idx} className="flex items-start gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                                                    <span className="text-zinc-300">{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* API Access */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Powerful API for Developers
                            </h2>
                            <p className="text-xl text-zinc-400 mb-8">
                                RESTful API with comprehensive documentation. Integrate Ghana real estate data into your applications in minutes.
                            </p>

                            <div className="space-y-4 mb-8">
                                {[
                                    'RESTful endpoints with JSON responses',
                                    'Authentication via API keys',
                                    'Rate limiting: 1000 requests/hour',
                                    'Webhooks for real-time updates',
                                    'SDKs for Python, JavaScript, PHP'
                                ].map((feature, index) => (
                                    <div key={index} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                        </div>
                                        <span className="text-zinc-300">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Get API Access
                                </motion.button>
                            </Link>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-zinc-950 border border-zinc-800 rounded-lg p-6"
                        >
                            <div className="bg-zinc-900 rounded p-4 font-mono text-sm">
                                <div className="text-zinc-500 mb-2">{/* Example API Request */}</div>
                                <div className="text-green-400">GET</div>
                                <div className="text-zinc-300 mb-4">/api/v1/properties/comparables</div>

                                <div className="text-zinc-500 mb-2">{/* Response */}</div>
                                <div className="text-zinc-400">{'{'}</div>
                                <div className="pl-4 text-blue-400">"location"<span className="text-zinc-400">: </span>
                                    <span className="text-yellow-400">"East Legon, Accra"</span>,
                                </div>
                                <div className="pl-4 text-blue-400">"property_type"<span className="text-zinc-400">: </span>
                                    <span className="text-yellow-400">"Residential"</span>,
                                </div>
                                <div className="pl-4 text-blue-400">"bedrooms"<span className="text-zinc-400">: </span>
                                    <span className="text-purple-400">4</span>,
                                </div>
                                <div className="pl-4 text-blue-400">"avg_price_per_sqm"<span className="text-zinc-400">: </span>
                                    <span className="text-purple-400">3500</span>,
                                </div>
                                <div className="pl-4 text-blue-400">"currency"<span className="text-zinc-400">: </span>
                                    <span className="text-yellow-400">"GHS"</span>
                                </div>
                                <div className="text-zinc-400">{'}'}</div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <PremiumCTASection
                title="Start Accessing Ghana's Best Real Estate Data"
                description="Join leading banks, developers, and investors who rely on PROPMETRIK data for confident decision-making."
                primaryCTA={{
                    text: "Get Started",
                    href: "/contact"
                }}
                secondaryCTA={{
                    text: "View Pricing",
                    href: "/pricing"
                }}
                backgroundImage="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&q=80"
            />
        </main>
    );
}
