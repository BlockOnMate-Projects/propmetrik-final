'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { CheckCircle2, Building2, Wrench, Receipt, Users, ShieldCheck, Bell } from 'lucide-react';
import PropertyPortfolioVisual from '@/components/marketing/motion/PropertyPortfolioVisual';
import MaintenanceTrackerVisual from '@/components/marketing/motion/MaintenanceTrackerVisual';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';

export default function PropertyManagementPage() {
    const capabilities = [
        {
            icon: <Building2 className="w-6 h-6" />,
            title: 'Tenant & Lease Management',
            description: 'Digital lease signing, automated renewals, rent escalation schedules, and tenant screening — all in one place.',
        },
        {
            icon: <Receipt className="w-6 h-6" />,
            title: 'Rent Collection & Accounting',
            description: 'Automated invoicing, Mobile Money & bank integrations, arrears tracking, and owner distribution reports.',
        },
        {
            icon: <Wrench className="w-6 h-6" />,
            title: 'Maintenance & Work Orders',
            description: 'Tenant-submitted requests, vendor dispatch, priority routing, and preventive maintenance scheduling.',
        },
        {
            icon: <Users className="w-6 h-6" />,
            title: 'Owner & Investor Portal',
            description: 'Real-time NOI dashboards, monthly statements, capital expenditure tracking, and document vault.',
        },
        {
            icon: <ShieldCheck className="w-6 h-6" />,
            title: 'Compliance & Insurance',
            description: 'Lease clause compliance monitoring, insurance policy tracking, and statutory filing reminders.',
        },
        {
            icon: <Bell className="w-6 h-6" />,
            title: 'Smart Notifications',
            description: 'Automated alerts for rent due dates, lease expirations, maintenance SLA breaches, and vacancy warnings.',
        },
    ];

    const useCases = [
        {
            title: 'Residential Portfolios',
            description: 'Manage single-family, multi-family, and estate communities with tenant-centric workflows.',
            features: [
                'Tenant screening & onboarding',
                'Automated rent reminders via SMS',
                'Community notice board',
                'Unit turnover checklists',
            ],
        },
        {
            title: 'Commercial & Retail',
            description: 'Triple-net, gross, and percentage leases with CAM reconciliation and tenant billing.',
            features: [
                'CAM charge allocation & reconciliation',
                'Percentage rent calculation',
                'Tenant improvement tracking',
                'Multi-tenant utility splitting',
            ],
        },
        {
            title: 'Mixed-Use & Hospitality',
            description: 'Flexible platform for properties combining residential, commercial, and short-stay units.',
            features: [
                'Short-stay booking integration',
                'Revenue-per-unit analytics',
                'Housekeeping scheduling',
                'Dynamic pricing support',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Onboard Your Portfolio',
            description: 'Import properties, units, and existing leases — or start fresh. Bulk upload via CSV supported.',
        },
        {
            title: 'Set Up Rent & Workflows',
            description: 'Configure rent schedules, payment methods, approval chains, and maintenance SLA rules.',
        },
        {
            title: 'Manage Day-to-Day',
            description: 'Tenants submit requests, rent is collected automatically, and vendors are dispatched — you just oversee.',
        },
        {
            title: 'Report & Optimize',
            description: 'Monthly owner statements, vacancy analysis, and AI-driven rent optimization recommendations.',
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
                            src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1920&q=80"
                            alt="Modern apartment building"
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
                            Property Management
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Manage Properties,{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Maximize Returns
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            From rent collection to maintenance dispatch — a complete property management platform designed for Ghana&apos;s landlords, facility managers, and institutional investors.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
                            <StatsCounter value={2400} label="Units Managed" suffix="+" />
                            <StatsCounter value={97} label="Rent Collection Rate" suffix="%" />
                            <StatsCounter value={2.1} label="Avg Maintenance Response" suffix="h" />
                            <StatsCounter value={45} label="Portfolios Active" suffix="+" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=property_management">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Start Free Trial
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=property_management">
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

            {/* ====== Portfolio Dashboard Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            Your Entire Portfolio at a Glance
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Occupancy, revenue, and maintenance — unified in one live view across all your properties.
                        </p>
                    </motion.div>

                    <div className="max-w-2xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                        >
                            <PropertyPortfolioVisual />
                        </motion.div>
                    </div>
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
                            Built for Ghana&apos;s Property Market
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Mobile Money integrations, GHS accounting, and workflows tailored to local lease conventions.
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

            {/* ====== Maintenance Tracker Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Maintenance{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    on Autopilot
                                </span>
                            </h2>
                            <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                                Tenants submit requests from their phone. The system routes by priority, dispatches vendors, and tracks SLA — you only handle escalations.
                            </p>
                            <div className="space-y-4">
                                {[
                                    'Tenant self-service portal with photo uploads',
                                    'Auto-priority routing (urgent → immediate dispatch)',
                                    'Vendor performance scoring & preferred lists',
                                    'Preventive maintenance calendar with reminders',
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
                            <MaintenanceTrackerVisual />
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
                            Every Property Type, One Platform
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Residential, commercial, mixed-use, or hospitality — configured to your asset class.
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
                            From portfolio setup to automated operations in four simple steps.
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
                            Pricing That Scales With You
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Pay per-unit, not per-property. Start small, grow without limits.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Starter',
                                price: 'GHS 250',
                                audience: 'Individual landlords',
                                features: ['Up to 20 units', 'Rent collection & tracking', 'Basic maintenance ticketing', 'Tenant portal', 'SMS notifications'],
                            },
                            {
                                tier: 'Professional',
                                price: 'GHS 550',
                                audience: 'Property managers',
                                features: ['Up to 100 units', 'Multi-property dashboard', 'Mobile Money integration', 'Owner statements', 'Vendor management', 'Custom lease templates'],
                                featured: true,
                            },
                            {
                                tier: 'Enterprise',
                                price: 'GHS 1,100',
                                audience: 'Institutional portfolios',
                                features: ['Unlimited units', 'Multi-organization', 'API & ERP integrations', 'AI rent optimization', 'Dedicated account manager', 'SLA guarantee', 'Custom branding'],
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
                                <Link href={`/signup?plan=prop-${plan.tier.toLowerCase()}&category=property_management`}>
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
                title="Ready to Simplify Property Management?"
                description="Join landlords and property managers across Ghana who trust PROPMETRIK to collect rent, manage tenants, and maximize returns."
                primaryCTA={{
                    text: 'Start Free Trial',
                    href: '/signup?category=property_management',
                }}
                secondaryCTA={{
                    text: 'Book a Demo',
                    href: '/contact',
                }}
                backgroundImage="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80"
            />
        </main>
    );
}
