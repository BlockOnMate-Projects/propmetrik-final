'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ValuationScanner from './motion/ValuationScanner';
import DataStreamVisual from './motion/DataStreamVisual';
import DealWorkflow from './motion/DealWorkflow';
import AnalyticsVisual from './motion/AnalyticsVisual';
import ProjectDashboardVisual from './motion/ProjectDashboardVisual';
import PropertyPortfolioVisual from './motion/PropertyPortfolioVisual';

const services = [
    {
        title: 'Valuation Engine',
        description: 'AI-driven automated valuations, portfolio revaluations, and development appraisals powered by proprietary ML models.',
        href: '/services/valuation',
        Visual: ValuationScanner,
    },
    {
        title: 'Data Hub',
        description: 'Real-time dashboards, market comparables, construction cost indices, and land title integrations.',
        href: '/services/data',
        Visual: DataStreamVisual,
    },
    {
        title: 'Deal Management',
        description: 'End-to-end CRM for agents — lead tracking, digital closings, e-signatures, and commission management.',
        href: '/services/deal-management',
        Visual: DealWorkflow,
    },
    {
        title: 'Market Intelligence',
        description: 'Neighbourhood analytics, economic indicators, rental yields, and custom research reports on demand.',
        href: '/services/market-intelligence',
        Visual: AnalyticsVisual,
    },
    {
        title: 'Project Management',
        description: 'Task & milestone tracking, budget control, contractor management, and automated construction monitoring.',
        href: '/services/project-management',
        Visual: ProjectDashboardVisual,
    },
    {
        title: 'Property Management',
        description: 'Tenant & lease management, maintenance workflows, financial reporting, and owner distribution portals.',
        href: '/services/property-management',
        Visual: PropertyPortfolioVisual,
    },
];

export default function ServicesFooter() {
    return (
        <section className="bg-zinc-950 border-t border-zinc-800 pt-24 pb-12">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-16"
                >
                    <div className="inline-block px-3 py-1 mb-4 border border-amber-500/20 text-amber-500 rounded-full text-[10px] font-bold tracking-widest uppercase bg-amber-500/5">
                        Our Platform
                    </div>
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tighter">
                            Built for Ghana&apos;s <span className="text-amber-500">Real Estate</span> Professionals
                        </h2>
                        <Link
                            href="/services"
                            className="text-sm text-zinc-400 hover:text-amber-500 transition-colors inline-flex items-center gap-1 shrink-0"
                        >
                            View all services <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map((service, idx) => (
                        <motion.div
                            key={service.title}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: idx * 0.08 }}
                        >
                            <Link
                                href={service.href}
                                className="group block rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-amber-500/30 hover:bg-zinc-900/70 transition-all duration-300 overflow-hidden h-full"
                            >
                                {/* Visual */}
                                <div className="h-48 overflow-hidden relative">
                                    <div className="absolute inset-0 scale-[0.55] origin-center pointer-events-none">
                                        <service.Visual />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-900/90" />
                                </div>

                                {/* Content */}
                                <div className="p-6 pt-2">
                                    <h3 className="text-lg font-bold text-white group-hover:text-amber-500 transition-colors mb-2 flex items-center gap-2">
                                        {service.title}
                                        <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                    </h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        {service.description}
                                    </p>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
