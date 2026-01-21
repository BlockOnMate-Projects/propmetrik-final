'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import PropertyShowcase from '@/components/motion/PropertyShowcase';
import ProcessTimeline from '@/components/motion/ProcessTimeline';
import PremiumCTASection from '@/components/motion/PremiumCTASection';
import StatsCounter from '@/components/motion/StatsCounter';
import { TrendingUp, Shield, Zap, CheckCircle2 } from 'lucide-react';

export default function ValuationServicePage() {
    const valuationSteps = [
        {
            title: 'Submit Property Details',
            description: 'Upload property information including location, size, and features',
        },
        {
            title: 'AI-Powered Analysis',
            description: 'Our algorithms analyze 50,000+ Ghana market data points',
        },
        {
            title: 'Expert Verification',
            description: 'RICS-certified valuers review and validate the assessment',
        },
        {
            title: 'Comprehensive Report',
            description: 'Receive detailed valuation with confidence intervals and market insights',
            icon: '📊'
        },
    ];

    const features = [
        {
            icon: <TrendingUp className="w-6 h-6" />,
            title: 'AI-Powered Accuracy',
            description: 'Machine learning models trained on 50,000+ verified Ghanaian property transactions'
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'RICS Certified',
            description: 'All valuations reviewed by qualified RICS-accredited professionals'
        },
        {
            icon: <Zap className="w-6 h-6" />,
            title: 'Rapid Turnaround',
            description: 'Get preliminary valuations instantly, full reports within 24-48 hours'
        },
    ];

    const services = [
        {
            title: 'Automated Valuation Models (AVM)',
            description: 'Instant property valuations powered by AI and verified local data',
            features: [
                'Instant estimates with confidence intervals',
                'Residential and commercial properties',
                'Coverage across Greater Accra, Kumasi, and Takoradi',
                'API access for bulk valuations'
            ]
        },
        {
            title: 'Portfolio Revaluation',
            description: 'Comprehensive portfolio analysis for institutional investors',
            features: [
                'Bulk property revaluation services',
                'Real-time performance tracking',
                'Market index benchmarking',
                'Quarterly revaluation scheduling'
            ]
        },
        {
            title: 'Development Appraisal',
            description: 'Feasibility studies for development projects',
            features: [
                'Residual land value calculations',
                'Construction cost analysis',
                'Absorption rate modeling',
                'NPV and IRR projections'
            ]
        },
    ];

    return (
        <main>
            {/* Hero Section */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1920&q=80"
                        alt="Property valuation"
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
                            Valuation & Advisory
                        </div>
                        <h1 className="text-5xl md:text-7xl  font-bold tracking-tighter mb-8 text-white">
                            Confident Valuations for Ghana's{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Real Estate Market
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            Leverage AI and 50,000+ verified local data points to deliver instant, high-confidence property valuations trusted by banks, insurers, and developers across Ghana.
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 mb-12">
                            <StatsCounter value={5000} label="Properties Valued" suffix="+" />
                            <StatsCounter value={95} label="Accuracy Rate" suffix="%" />
                            <StatsCounter value={24} label="Hour Turnaround" suffix="h" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Request Valuation
                                </motion.button>
                            </Link>
                            <Link href="/pricing">
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

            {/* Property Showcase */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <PropertyShowcase
                        imageUrl="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80"
                        stats={[
                            { label: 'Avg. Accuracy', value: '95.2%' },
                            { label: 'Valuations/Month', value: '1,000+' },
                            { label: 'Response Time', value: '<24h' }
                        ]}
                    />
                </div>
            </section>

            {/* Why Choose Us */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Why Choose PropMetrik
                        </h2>
                        <p className="text-xl text-zinc-400">
                            The most trusted valuation platform in Ghana, combining technology with expert oversight
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
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

            {/* Services */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Our Valuation Services
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Comprehensive solutions for every valuation need
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {services.map((service, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-950 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <h3 className="text-2xl font-bold text-white mb-3">{service.title}</h3>
                                <p className="text-zinc-400 mb-6">{service.description}</p>

                                <ul className="space-y-3">
                                    {service.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Process Timeline */}
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
                            Simple, transparent process from request to report
                        </p>
                    </motion.div>

                    <ProcessTimeline steps={valuationSteps} />
                </div>
            </section>

            {/* CTA Section */}
            <PremiumCTASection
                title="Ready to Get Started?"
                description="Join thousands of satisfied clients across Ghana who trust PropMetrik for accurate, reliable property valuations."
                primaryCTA={{
                    text: "Request Valuation",
                    href: "/contact"
                }}
                secondaryCTA={{
                    text: "View Pricing",
                    href: "/pricing"
                }}
                backgroundImage="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80"
            />
        </main>
    );
}
