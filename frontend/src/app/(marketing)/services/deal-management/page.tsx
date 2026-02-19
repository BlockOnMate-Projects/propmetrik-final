'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import DashboardDemo from '@/components/marketing/motion/DashboardDemo';
import DealWorkflow from '@/components/marketing/motion/DealWorkflow';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import { Users, FileText, Calendar, BarChart3, CheckCircle2, Zap, MessageSquare } from 'lucide-react';

export default function DealManagementPage() {
    const capabilities = [
        {
            icon: <Users className="w-6 h-6" />,
            title: 'Agency CRM',
            description: 'Lead scoring, contact management, viewing scheduling, and automated follow-ups built for real estate brokers.',
        },
        {
            icon: <FileText className="w-6 h-6" />,
            title: 'Digital Closings',
            description: 'Auto-generate sale & tenancy agreements, collect e-signatures, and track approval workflows in one place.',
        },
        {
            icon: <Calendar className="w-6 h-6" />,
            title: 'Inventory Management',
            description: 'Real-time unit availability, multi-channel sync, reservations, and pricing & discount controls for developers.',
        },
        {
            icon: <BarChart3 className="w-6 h-6" />,
            title: 'Analytics & Reporting',
            description: 'Sales pipeline analytics, agent performance metrics, lead conversion tracking, and custom report builder.',
        },
        {
            icon: <MessageSquare className="w-6 h-6" />,
            title: 'WhatsApp & SMS Integration',
            description: 'Send viewing confirmations, payment reminders, and deal updates directly via WhatsApp Business API.',
        },
        {
            icon: <Zap className="w-6 h-6" />,
            title: 'Commission Engine',
            description: 'Automated commission calculations, split rules, and payout tracking across your entire brokerage team.',
        },
    ];

    const useCases = [
        {
            title: 'For Brokers & Agents',
            description: 'Manage your entire sales pipeline from lead capture to commission payout.',
            features: [
                'Close deals 40% faster',
                'Track all client interactions',
                'Automated follow-ups & reminders',
                'Mobile app for on-the-go access',
            ],
        },
        {
            title: 'For Developers',
            description: 'Control inventory and sales performance across all your projects.',
            features: [
                'Real-time unit availability',
                'Multi-project management',
                'Marketing channel integration',
                'Centralised reporting dashboard',
            ],
        },
        {
            title: 'For Property Managers',
            description: 'Streamline tenant acquisition with screening, lease generation, and onboarding.',
            features: [
                'Tenant screening & verification',
                'Lease agreement generation',
                'Maintenance request tracking',
                'Rent collection automation',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Capture Leads',
            description: 'Import from website, social media, referrals, or manual entry — all in one inbox.',
        },
        {
            title: 'Manage Clients',
            description: 'Track interactions, schedule viewings, send documents, and score leads automatically.',
        },
        {
            title: 'Generate Documents',
            description: 'Auto-generate agreements and contracts with built-in e-signature workflows.',
        },
        {
            title: 'Close & Collect',
            description: 'Finalise deals, trigger commission calculations, and track payments to completion.',
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
                            src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1920&q=80"
                            alt="Deal management"
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
                            Deal Management
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Close Deals Faster with{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                End-to-End Automation
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            Complete workflow automation for modern real estate professionals. CRM, document management, and closing tools built specifically for the Ghanaian market.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
                            <StatsCounter value={40} label="Faster Closings" suffix="%" />
                            <StatsCounter value={500} label="Active Users" suffix="+" />
                            <StatsCounter value={2000} label="Deals Closed" suffix="+" />
                            <StatsCounter value={15} label="Avg. Days to Close" suffix="d" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=deal_management">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Start Free Trial
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=deal_management">
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

            {/* ====== Dashboard Demo ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            Your Entire Pipeline, Live
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Leads, viewings, offers, and closings — everything visible in one intuitive dashboard.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <DashboardDemo />
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
                            Everything You Need to Close
                        </h2>
                        <p className="text-xl text-zinc-400">
                            All the tools to run a modern real estate business — no spreadsheets required.
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

            {/* ====== Split — Deal Workflow Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Seamless{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Integrations
                                </span>
                            </h2>
                            <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                                Connect to the tools your team already uses. PROPMETRIK syncs with messaging, calendar, payments, and marketing platforms out of the box.
                            </p>
                            <div className="space-y-4">
                                {[
                                    'WhatsApp Business for instant client updates',
                                    'Google Calendar sync for viewing appointments',
                                    'Mobile Money & bank payment acceptance',
                                    'Automated email drip campaigns for nurturing',
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
                            <DealWorkflow />
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
                            Built for Every Role
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Tailored workflows for brokers, developers, and property managers.
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
                            From lead to closing in four simple steps.
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
                            Simple, Results-Based Pricing
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Start free. Upgrade as your deal volume grows.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Solo Agent',
                                price: 'GHS 199',
                                audience: 'Individual brokers',
                                features: ['Up to 50 active leads', 'Document generation', 'Viewing scheduler', 'Commission tracker', 'Mobile app'],
                            },
                            {
                                tier: 'Brokerage',
                                price: 'GHS 499',
                                audience: 'Growing teams',
                                features: ['Unlimited leads', 'Up to 15 agents', 'Pipeline analytics', 'E-signature workflows', 'WhatsApp integration', 'Custom reporting'],
                                featured: true,
                            },
                            {
                                tier: 'Developer',
                                price: 'GHS 999',
                                audience: 'Developers & enterprises',
                                features: ['Unlimited agents & projects', 'Inventory management', 'Multi-project dashboard', 'Payment gateway', 'API access', 'Dedicated support', 'White-label option'],
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
                                <Link href={`/signup?plan=deal-${plan.tier.toLowerCase().replace(/\s/g, '-')}&category=deal_management`}>
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
                title="Ready to Transform Your Sales Workflow?"
                description="Join hundreds of Ghanaian real estate professionals who&apos;ve accelerated their closings with PROPMETRIK."
                primaryCTA={{
                    text: 'Start Free Trial',
                    href: '/signup?category=deal_management',
                }}
                secondaryCTA={{
                    text: 'Book a Demo',
                    href: '/contact',
                }}
                backgroundImage="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1920&q=80"
            />
        </main>
    );
}
