'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import {
    Eye,
    Shield,
    Zap,
    Globe,
    Users,
    Lightbulb,
    Target,
    Building2,
    TrendingUp,
    Database,
} from 'lucide-react';

const fade = {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5 },
};

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <div className="text-xs font-semibold tracking-[0.2em] uppercase text-amber-500 mb-5">{children}</div>;
}

const story = [
    {
        label: 'Our Vision',
        text: 'To become the definitive operating system for real estate in West Africa — a market where every property has a known value, a verified history, and a liquid future.',
    },
    {
        label: 'The Problem',
        text: 'For decades the market has run on opacity. Buyers doubt prices, banks fear collateral, and developers guess demand. We replace guesswork with granular, verified intelligence.',
    },
    {
        label: 'Our Approach',
        text: 'We combine boots-on-the-ground data collection with AI valuations. We don\'t just aggregate listings — we verify facts, standardise records, and build the digital infrastructure for the future.',
    },
];

const pillars = [
    { icon: <Database className="w-5 h-5" />, title: 'Data Hub', body: 'Verified transactions, cost indices, and hyperlocal market data.', href: '/services/data' },
    { icon: <TrendingUp className="w-5 h-5" />, title: 'Valuation Engine', body: 'AI automated and professional valuations with institutional-grade reporting.', href: '/services/valuation' },
    { icon: <Target className="w-5 h-5" />, title: 'Deal Management', body: 'CRM, digital closings, inventory tracking, and commissions.', href: '/services/deal-management' },
    { icon: <Lightbulb className="w-5 h-5" />, title: 'Market Intelligence', body: 'Research reports, trend analysis, and custom investment analytics.', href: '/services/market-intelligence' },
];

const values = [
    { icon: <Eye className="w-5 h-5" />, title: 'Transparency', body: 'Every data point and valuation — traceable, auditable, open to scrutiny.' },
    { icon: <Shield className="w-5 h-5" />, title: 'Integrity', body: 'We verify facts over claims. No self-reported listings, no inflated figures.' },
    { icon: <Zap className="w-5 h-5" />, title: 'Innovation', body: 'AI models, blockchain records, and automation — purpose-built for Africa.' },
    { icon: <Globe className="w-5 h-5" />, title: 'Local Expertise', body: 'Built in Accra, for Accra — then scaled with deep market knowledge.' },
    { icon: <Users className="w-5 h-5" />, title: 'Collaboration', body: 'Banks, valuers, developers, and agents — one ecosystem, shared standards.' },
    { icon: <Lightbulb className="w-5 h-5" />, title: 'Impact', body: 'Success measured by how many people and institutions trust the market.' },
];

const roadmap = [
    { tag: 'In development', title: 'Blockchain Title Registry', body: 'Immutable, on-chain records for ownership and transaction history — making title verification instant and fraud far harder.' },
    { tag: '2027 target', title: 'West Africa Expansion', body: 'Extending verified coverage beyond Ghana to Nigeria, Côte d\'Ivoire, and Kenya.' },
];

export default function AboutPage() {
    return (
        <main className="bg-background text-foreground">
            {/* Hero */}
            <section className="pt-40 pb-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>About PROPMETRIK</Eyebrow>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-8 max-w-4xl">
                            Formalising real estate in Africa, one verified record at a time.
                        </h1>
                        <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
                            PROPMETRIK is on a mission to digitise Ghana&apos;s real estate ecosystem through reliable
                            data, transparent valuations, and intelligent tools — built in Accra, for the region.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Vision / Problem / Approach */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <div className="grid md:grid-cols-3 gap-x-12 gap-y-12">
                        {story.map((s) => (
                            <motion.div key={s.label} {...fade}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-px bg-amber-500" />
                                    <span className="text-xs text-amber-500 font-bold uppercase tracking-wider">{s.label}</span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed">{s.text}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Why Ghana */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade} className="max-w-3xl">
                        <Eyebrow>The opportunity</Eyebrow>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
                            Why <span className="text-amber-500">Ghana</span>
                        </h2>
                        <p className="text-lg text-muted-foreground leading-relaxed">
                            Ghana&apos;s real estate market is large and rapidly urbanising, yet most transactions
                            still lack verifiable data. The gap between market potential and information
                            infrastructure is wide — and closing it is the whole point of PROPMETRIK.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* What we build */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>What we build</Eyebrow>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-14 max-w-3xl">
                            An integrated platform across the full real estate lifecycle.
                        </h2>
                    </motion.div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-card border border-border rounded-xl overflow-hidden">
                        {pillars.map((p) => (
                            <Link key={p.title} href={p.href}>
                                <motion.div {...fade} className="bg-background p-7 h-full hover:bg-card/60 transition-colors group">
                                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                                        {p.icon}
                                    </div>
                                    <h3 className="text-base font-bold text-foreground mb-1.5 group-hover:text-amber-500 transition-colors">{p.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Roadmap */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>Roadmap</Eyebrow>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 max-w-3xl">
                            What we&apos;re building next.
                        </h2>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-14">
                            The platform formalising Ghana&apos;s real estate today is the foundation for what comes next.
                        </p>
                    </motion.div>
                    <div className="grid sm:grid-cols-2 gap-px bg-card border border-border rounded-xl overflow-hidden">
                        {roadmap.map((r) => (
                            <motion.div key={r.title} {...fade} className="bg-background p-7">
                                <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 rounded-full px-3 py-1 mb-4">{r.tag}</span>
                                <h3 className="text-lg font-bold text-foreground mb-1.5">{r.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>Our values</Eyebrow>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-14 max-w-3xl">
                            Principles that guide every decision.
                        </h2>
                    </motion.div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
                        {values.map((v) => (
                            <motion.div key={v.title} {...fade}>
                                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                                    {v.icon}
                                </div>
                                <h3 className="text-lg font-bold text-foreground mb-2">{v.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{v.body}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Built for */}
            <section className="py-24 border-b border-border">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>Built for industry leaders</Eyebrow>
                        <p className="text-muted-foreground mb-10 max-w-2xl">
                            Designed for banks, government institutions, valuation firms, and developers across Ghana.
                        </p>
                    </motion.div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-card border border-border rounded-xl overflow-hidden">
                        {['Commercial Banks', 'Government Institutions', 'Valuation Firms', 'Property Developers'].map((p) => (
                            <motion.div key={p} {...fade} className="bg-background flex items-center justify-center h-24 px-4 text-center">
                                <span className="text-sm text-muted-foreground font-medium">{p}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <PremiumCTASection
                title="Join the Future of African Real Estate"
                description="Whether you're a valuer, developer, bank, or investor — PROPMETRIK gives you the data and tools to move with confidence."
                primaryCTA={{ text: 'Get Started', href: '/signup' }}
                secondaryCTA={{ text: 'For Investors', href: '/investors' }}
                backgroundImage="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
            />
        </main>
    );
}
