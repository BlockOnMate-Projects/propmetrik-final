'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import {
    Eye,
    Shield,
    Zap,
    Globe,
    Users,
    Lightbulb,
    Target,
    CheckCircle2,
    Building2,
    MapPin,
    TrendingUp,
    Database,
} from 'lucide-react';
import { useState, useEffect } from 'react';

/* ---- Animated logo mark that pulses in the hero ---- */
function PulsingMark() {
    return (
        <motion.div
            className="relative w-20 h-20 mx-auto mb-8"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-yellow-400 opacity-20 blur-xl" />
            <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center">
                <span className="text-2xl font-black text-zinc-950 tracking-tighter">PM</span>
            </div>
        </motion.div>
    );
}

/* ---- Milestone timeline component ---- */
function MilestoneTimeline() {
    const milestones = [
        {
            year: '2026 Q1',
            title: 'Founded in Accra',
            description: 'PROPMETRIK launches with a mission to formalize Ghana\'s real estate data.',
        },
        {
            year: '2026 Q1',
            title: 'Data Hub Launch',
            description: '50,000+ verified property transactions standardized and accessible via API.',
        },
        {
            year: '2026 Q2',
            title: 'AI Valuation Engine',
            description: 'Automated Valuation Model covering 8 cities with 95% accuracy.',
        },
        {
            year: '2026 Q3',
            title: 'Deal Management Platform',
            description: 'End-to-end CRM for brokers, developers, and property managers.',
        },
        {
            year: '2026 Q4',
            title: 'Blockchain Title Registry',
            description: 'Immutable on-chain records for property ownership and transaction history.',
        },
        {
            year: '2027',
            title: 'West Africa Expansion',
            description: 'Extending coverage to Nigeria, Côte d\'Ivoire, and Kenya.',
        },
    ];

    return (
        <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-zinc-800 -translate-x-1/2" />

            <div className="space-y-12">
                {milestones.map((ms, index) => {
                    const isLeft = index % 2 === 0;
                    return (
                        <motion.div
                            key={ms.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="relative grid md:grid-cols-2 gap-8 items-center"
                        >
                            {/* Dot */}
                            <div className="absolute left-6 md:left-1/2 w-3 h-3 bg-primary rounded-full -translate-x-1/2 z-10 ring-4 ring-zinc-950" />

                            {/* Content — alternating sides on desktop */}
                            <div className={`pl-14 md:pl-0 ${isLeft ? 'md:text-right md:pr-12' : 'md:col-start-2 md:pl-12'}`}>
                                <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">
                                    {ms.year}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">{ms.title}</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">{ms.description}</p>
                            </div>

                            {/* Empty spacer for the other column on desktop */}
                            <div className={`hidden md:block ${isLeft ? 'md:col-start-2' : 'md:col-start-1 md:row-start-1'}`} />
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

/* ---- Rotating word component for hero ---- */
function RotatingWords() {
    const words = ['Trust', 'Transparency', 'Intelligence', 'Growth'];
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setIndex((i) => (i + 1) % words.length), 2800);
        return () => clearInterval(interval);
    }, []);

    return (
        <span className="inline-block relative h-[1.15em] overflow-hidden align-bottom">
            <AnimatePresence mode="wait">
                <motion.span
                    key={words[index]}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -40, opacity: 0 }}
                    transition={{ duration: 0.45, ease: 'easeInOut' }}
                    className="absolute left-0 text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400"
                >
                    {words[index]}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

export default function AboutPage() {
    const values = [
        {
            icon: <Eye className="w-6 h-6" />,
            title: 'Transparency',
            description: 'Every data point, every valuation — traceable, auditable, and open to scrutiny.',
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'Integrity',
            description: 'We verify facts over claims. No self-reported listings, no inflated figures.',
        },
        {
            icon: <Zap className="w-6 h-6" />,
            title: 'Innovation',
            description: 'AI models, blockchain records, and smart automation — purpose-built for Africa.',
        },
        {
            icon: <Globe className="w-6 h-6" />,
            title: 'Local Expertise',
            description: 'Built in Accra, for Accra — then scaled Africa-wide with deep market knowledge.',
        },
        {
            icon: <Users className="w-6 h-6" />,
            title: 'Collaboration',
            description: 'Banks, valuers, developers, and agents — one ecosystem, shared standards.',
        },
        {
            icon: <Lightbulb className="w-6 h-6" />,
            title: 'Impact',
            description: 'We measure success by how many families, investors, and institutions trust the market.',
        },
    ];

    const advantages = [
        { icon: <Database className="w-5 h-5" />, text: '50,000+ verified property transactions' },
        { icon: <MapPin className="w-5 h-5" />, text: '12 cities with hyperlocal coverage' },
        { icon: <TrendingUp className="w-5 h-5" />, text: 'AI valuations with 95% accuracy' },
        { icon: <Building2 className="w-5 h-5" />, text: 'Blockchain-backed title records' },
    ];

    return (
        <main>
            {/* ====== Hero ====== */}
            <section className="relative pt-32 pb-28 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
                            alt="Modern office"
                            className="w-full h-full object-cover opacity-10"
                        />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/90 to-zinc-950" />
                </div>

                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="max-w-4xl mx-auto text-center"
                    >
                        <PulsingMark />

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Building <RotatingWords /> in<br />
                            African Real Estate
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mx-auto mb-14">
                            PROPMETRIK is on a mission to formalize and digitize Ghana&apos;s real estate ecosystem through reliable data, transparent valuations, and intelligent tools.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
                            <StatsCounter value={50000} label="Data Points" suffix="+" />
                            <StatsCounter value={12} label="Cities" />
                            <StatsCounter value={95} label="AI Accuracy" suffix="%" />
                            <StatsCounter value={500} label="Users" suffix="+" />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ====== Story — Vision / Problem / Approach ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        {/* Image side */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="relative h-[560px] rounded-xl overflow-hidden"
                        >
                            <motion.div
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                                className="absolute inset-0"
                            >
                                <img
                                    src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"
                                    alt="Accra skyline"
                                    className="w-full h-full object-cover"
                                />
                            </motion.div>
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                            <div className="absolute bottom-8 left-8 right-8">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.3 }}
                                >
                                    <div className="text-6xl font-black text-white tracking-tighter mb-1">2026</div>
                                    <div className="text-xs uppercase tracking-[0.25em] text-zinc-400 font-medium">
                                        Founded in Accra, Ghana
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>

                        {/* Text side */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="space-y-10"
                        >
                            {[
                                {
                                    label: 'Our Vision',
                                    text: 'To become the definitive operating system for real estate in West Africa, creating a market where every property has a known value, verified history, and liquid future.',
                                },
                                {
                                    label: 'The Problem',
                                    text: 'For decades, the market has suffered from opacity. Buyers doubt prices, banks fear collateral, and developers guess demand. We are replacing guesswork with granular, verified intelligence.',
                                },
                                {
                                    label: 'Our Approach',
                                    text: "We combine boots-on-the-ground data collection with advanced AI valuations. We don't just aggregate listings — we verify facts, standardize records, and build the digital infrastructure for the future.",
                                },
                            ].map((block, i) => (
                                <motion.div
                                    key={block.label}
                                    initial={{ opacity: 0, y: 15 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.15 + i * 0.12 }}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-8 h-px bg-primary" />
                                        <span className="text-xs text-primary font-bold uppercase tracking-wider">
                                            {block.label}
                                        </span>
                                    </div>
                                    <p className="text-zinc-300 leading-relaxed text-[15px]">{block.text}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ====== Why Ghana / Market Opportunity ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="inline-block px-3 py-1 mb-6 border border-primary/50 rounded-full text-xs font-medium tracking-wider uppercase bg-primary/10 text-primary">
                                The Opportunity
                            </div>
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                                Why{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Ghana
                                </span>
                            </h2>
                            <p className="text-zinc-400 leading-relaxed mb-8">
                                Ghana&apos;s real estate market is valued at over $10 billion, yet fewer than 5% of transactions have verifiable data. The gap between market potential and information infrastructure is massive — and we&apos;re closing it.
                            </p>
                            <div className="space-y-4">
                                {advantages.map((adv, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 + i * 0.1 }}
                                        className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4 hover:border-primary/30 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                            {adv.icon}
                                        </div>
                                        <span className="text-zinc-300 text-sm font-medium">{adv.text}</span>
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
                            {/* Decorative stats grid */}
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { value: '$10B+', label: 'Market Size', color: 'from-primary/20 to-yellow-400/10' },
                                    { value: '<5%', label: 'Data Coverage Today', color: 'from-red-500/20 to-orange-500/10' },
                                    { value: '32M', label: 'Population', color: 'from-blue-500/20 to-cyan-400/10' },
                                    { value: '3.7%', label: 'Annual GDP Growth', color: 'from-green-500/20 to-emerald-400/10' },
                                ].map((stat, i) => (
                                    <motion.div
                                        key={stat.label}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.3 + i * 0.1 }}
                                        whileHover={{ y: -4 }}
                                        className={`bg-gradient-to-br ${stat.color} border border-zinc-800 rounded-xl p-6 text-center`}
                                    >
                                        <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
                                        <div className="text-xs text-zinc-400 uppercase tracking-wider font-medium">{stat.label}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ====== Core Values ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Values</h2>
                        <p className="text-xl text-zinc-400">
                            Six principles that guide every decision, every product, and every partnership.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {values.map((value, index) => (
                            <motion.div
                                key={value.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.08 }}
                                whileHover={{ y: -5 }}
                                className="bg-zinc-950 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors group"
                            >
                                <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                                    {value.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">{value.title}</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed">{value.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== What We Do (Platform Pillars) ====== */}
            <section className="py-24 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What We Build</h2>
                        <p className="text-xl text-zinc-400">
                            An integrated platform that covers the full real estate lifecycle.
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            {
                                title: 'Data Hub',
                                description: 'Verified transactions, cost indices, and hyperlocal market data across 12 cities.',
                                href: '/services/data',
                                icon: <Database className="w-6 h-6" />,
                            },
                            {
                                title: 'Valuation Engine',
                                description: 'AI-powered automated and professional valuations with institutional-grade reporting.',
                                href: '/services/valuation',
                                icon: <TrendingUp className="w-6 h-6" />,
                            },
                            {
                                title: 'Deal Management',
                                description: 'CRM, digital closings, inventory tracking, and commission management for agents.',
                                href: '/services/deal-management',
                                icon: <Target className="w-6 h-6" />,
                            },
                            {
                                title: 'Market Intelligence',
                                description: 'Quarterly research reports, trend analysis, and custom investment analytics.',
                                href: '/services/market-intelligence',
                                icon: <Lightbulb className="w-6 h-6" />,
                            },
                        ].map((pillar, index) => (
                            <Link key={pillar.title} href={pillar.href}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                    whileHover={{ y: -6 }}
                                    className="h-full bg-zinc-900 border border-zinc-800 rounded-xl p-7 hover:border-primary/50 transition-all group cursor-pointer"
                                >
                                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-5 group-hover:bg-primary/20 transition-colors">
                                        {pillar.icon}
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-primary transition-colors">
                                        {pillar.title}
                                    </h3>
                                    <p className="text-zinc-400 text-sm leading-relaxed">{pillar.description}</p>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== Company Milestones ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-16"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Our Journey</h2>
                        <p className="text-xl text-zinc-400">
                            From founding to West Africa expansion — the milestones shaping our mission.
                        </p>
                    </motion.div>

                    <div className="max-w-3xl mx-auto">
                        <MilestoneTimeline />
                    </div>
                </div>
            </section>

            {/* ====== Partners & Trust ====== */}
            <section className="py-20 bg-zinc-950">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            Trusted By Industry Leaders
                        </h2>
                        <p className="text-zinc-400">
                            Banks, government institutions, and real estate firms across Ghana.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                        {[
                            'Commercial Banks',
                            'Ghana Lands Commission',
                            'Valuation Firms',
                            'Property Developers',
                        ].map((partner, i) => (
                            <motion.div
                                key={partner}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center justify-center h-24 bg-zinc-900 border border-zinc-800 rounded-lg"
                            >
                                <span className="text-sm text-zinc-500 font-medium tracking-wide text-center px-4">
                                    {partner}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== CTA ====== */}
            <PremiumCTASection
                title="Join the Future of African Real Estate"
                description="Whether you're a valuer, developer, bank, or investor — PROPMETRIK gives you the data and tools to move with confidence."
                primaryCTA={{
                    text: 'Get Started',
                    href: '/signup',
                }}
                secondaryCTA={{
                    text: 'Explore Services',
                    href: '/services',
                }}
                backgroundImage="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
            />
        </main>
    );
}
