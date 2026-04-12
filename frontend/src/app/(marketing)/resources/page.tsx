'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { guides } from '@/lib/guides';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import {
    BookOpen,
    ArrowRight,
    FileText,
    ImageIcon,
    Sparkles,
} from 'lucide-react';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06 },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function ResourcesPage() {
    const totalScreenshots = guides.reduce((sum, g) => sum + g.screenshotCount, 0);

    return (
        <div className="min-h-screen bg-zinc-950">
            {/* Hero */}
            <section className="relative pt-32 pb-20 overflow-hidden">
                {/* Background glow */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-zinc-950 to-zinc-950" />
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />

                <div className="relative max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center max-w-3xl mx-auto"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium mb-8">
                            <BookOpen className="w-4 h-4" />
                            Platform Documentation
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
                            Resources &{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-500">
                                Guides
                            </span>
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed mb-10">
                            Comprehensive how-to guides for every PropMetrik service.
                            Step-by-step instructions with annotated screenshots to help
                            you get the most out of the platform.
                        </p>

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-8 text-sm">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <FileText className="w-4 h-4 text-amber-500" />
                                <span className="font-semibold text-white">{guides.length}</span> Guides
                            </div>
                            <div className="w-px h-4 bg-zinc-700" />
                            <div className="flex items-center gap-2 text-zinc-400">
                                <ImageIcon className="w-4 h-4 text-amber-500" />
                                <span className="font-semibold text-white">{totalScreenshots}</span> Screenshots
                            </div>
                            <div className="w-px h-4 bg-zinc-700" />
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span className="font-semibold text-white">Step-by-Step</span> Instructions
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Quick Start */}
            <section className="py-4 border-y border-zinc-800/50">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
                        <span className="font-medium text-zinc-400">Quick start:</span>
                        <Link
                            href="/resources/authentication"
                            className="hover:text-amber-500 transition-colors"
                        >
                            New User? Start Here &rarr;
                        </Link>
                        <span className="text-zinc-700">|</span>
                        <Link
                            href="/resources/valuations"
                            className="hover:text-amber-500 transition-colors"
                        >
                            Valuers Guide
                        </Link>
                        <span className="text-zinc-700">|</span>
                        <Link
                            href="/resources/project-management"
                            className="hover:text-amber-500 transition-colors"
                        >
                            Project Managers
                        </Link>
                        <span className="text-zinc-700">|</span>
                        <Link
                            href="/resources/property-management"
                            className="hover:text-amber-500 transition-colors"
                        >
                            Property Managers
                        </Link>
                    </div>
                </div>
            </section>

            {/* Guide Cards */}
            <section className="py-20">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {guides.map((guide) => {
                            const Icon = guide.icon;
                            return (
                                <motion.div key={guide.slug} variants={cardVariants}>
                                    <Link
                                        href={`/resources/${guide.slug}`}
                                        className="group block h-full"
                                    >
                                        <div className="relative h-full bg-zinc-800 border border-zinc-600/30 rounded-xl p-6 transition-all duration-300 hover:border-amber-500/50 hover:bg-zinc-700/80 hover:shadow-lg hover:shadow-amber-500/10">
                                            {/* Chapter number */}
                                            <div className="absolute top-4 right-4 text-xs font-mono text-zinc-600">
                                                CH.{String(guide.chapter).padStart(2, '0')}
                                            </div>

                                            {/* Icon */}
                                            <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5 group-hover:bg-amber-500/20 transition-colors">
                                                <Icon className="w-6 h-6 text-amber-500" />
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                                                {guide.title}
                                            </h3>

                                            {/* Description */}
                                            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                                                {guide.description}
                                            </p>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between mt-auto">
                                                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                    <ImageIcon className="w-3.5 h-3.5" />
                                                    {guide.screenshotCount} screenshots
                                                </div>
                                                <div className="flex items-center gap-1 text-sm text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Read Guide
                                                    <ArrowRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </div>
            </section>

            {/* CTA */}
            <PremiumCTASection
                title="Ready to Get Started?"
                description="Join thousands of real estate professionals using PropMetrik to make smarter, data-driven decisions across Ghana."
                primaryCTA={{ text: 'Start Free Trial', href: '/signup' }}
                secondaryCTA={{ text: 'Request Demo', href: '/contact' }}
            />
        </div>
    );
}
