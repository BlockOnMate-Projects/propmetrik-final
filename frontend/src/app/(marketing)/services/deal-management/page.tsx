'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import DashboardDemo from '@/components/marketing/motion/DashboardDemo';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import { Users, FileText, Calendar, BarChart3, CheckCircle2, Zap } from 'lucide-react';

export default function DealManagementPage() {
    const dealSteps = [
        {
            title: 'Lead Capture',
            description: 'Capture leads from website, social media, and referrals',
        },
        {
            title: 'Client Management',
            description: 'Track interactions, schedule viewings, manage requirements',
        },
        {
            title: 'Document Generation',
            description: 'Auto-generate agreements and contracts with e-signature',
        },
        {
            title: 'Commission Tracking',
            description: 'Automated commission calculations and payment tracking',
            icon: '💰'
        },
    ];

    const features = [
        {
            icon: <Users className="w-6 h-6" />,
            title: 'Agency CRM',
            description: 'Complete customer relationship management built for Ghanaian real estate brokers',
            details: [
                'Lead management and scoring',
                'Contact database with custom fields',
                'Viewing scheduling and reminders',
                'Commission tracking and reporting',
            ]
        },
        {
            icon: <FileText className="w-6 h-6" />,
            title: 'Digital Closings',
            description: 'Streamline the closing process with automated document generation',
            details: [
                'Sale and tenancy agreement templates',
                'E-signature integration',
                'Document version control',
                'Approval workflow tracking',
            ]
        },
        {
            icon: <Calendar className="w-6 h-6" />,
            title: 'Inventory Management',
            description: 'Centralized control for developers managing multiple units',
            details: [
                'Real-time availability tracking',
                'Multi-channel sync (website, portals)',
                'Unit reservations and holds',
                'Pricing and discount management',
            ]
        },
        {
            icon: <BarChart3 className="w-6 h-6" />,
            title: 'Analytics & Reporting',
            description: 'Data-driven insights to improve your sales performance',
            details: [
                'Sales pipeline analytics',
                'Agent performance metrics',
                'Lead conversion tracking',
                'Custom report builder',
            ]
        },
    ];

    const useCases = [
        {
            title: 'For Brokers & Agents',
            description: 'Manage your entire sales pipeline from one platform',
            benefits: [
                'Close deals 40% faster',
                'Track all client interactions',
                'Automated follow-ups and reminders',
                'Mobile app for on-the-go access',
            ],
            cta: 'Start Free Trial'
        },
        {
            title: 'For Developers',
            description: 'Control inventory and sales across all your projects',
            benefits: [
                'Real-time unit availability',
                'Multi-project management',
                'Integration with marketing channels',
                'Centralized reporting dashboard',
            ],
            cta: 'Request Demo'
        },
        {
            title: 'For Property Managers',
            description: 'Streamline tenant acquisition and lease management',
            benefits: [
                'Tenant screening and verification',
                'Lease agreement generation',
                'Maintenance request tracking',
                'Rent collection automation',
            ],
            cta: 'Learn More'
        },
    ];

    return (
        <main>
            {/* Hero Section */}
            <section className="relative pt-32 pb-24 overflow-hidden bg-zinc-950">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1920&q=80"
                        alt="Deal management"
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

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 mb-12">
                            <StatsCounter value={40} label="Faster Closings" suffix="%" />
                            <StatsCounter value={500} label="Active Users" suffix="+" />
                            <StatsCounter value={2000} label="Deals Closed" suffix="+" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Start Free Trial
                                </motion.button>
                            </Link>
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    Request Demo
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Dashboard Demo */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Powerful, Intuitive Interface
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Everything you need to manage your real estate business in one place
                        </p>
                    </motion.div>

                    <DashboardDemo />
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
                            Complete Feature Set
                        </h2>
                        <p className="text-xl text-zinc-400">
                            All the tools you need to run a modern real estate business
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-2 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-primary/50 transition-colors"
                            >
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                        {feature.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white mb-2">{feature.title}</h3>
                                        <p className="text-zinc-400">{feature.description}</p>
                                    </div>
                                </div>

                                <ul className="space-y-3">
                                    {feature.details.map((detail, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-zinc-300">
                                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                            <span>{detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Use Cases */}
            <section className="py-24 bg-zinc-900">
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
                            Tailored solutions for brokers, developers, and property managers
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {useCases.map((useCase, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-zinc-950 border border-zinc-800 rounded-lg p-8"
                            >
                                <h3 className="text-2xl font-bold text-white mb-3">{useCase.title}</h3>
                                <p className="text-zinc-400 mb-6">{useCase.description}</p>

                                <ul className="space-y-3 mb-8">
                                    {useCase.benefits.map((benefit, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                            <span>{benefit}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link href="/contact">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="w-full px-6 py-3 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors"
                                    >
                                        {useCase.cta}
                                    </motion.button>
                                </Link>
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
                            From lead to closing in four simple steps
                        </p>
                    </motion.div>

                    <ProcessTimeline steps={dealSteps} />
                </div>
            </section>

            {/* Integration Info */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Seamless Integrations
                            </h2>
                            <p className="text-xl text-zinc-400 mb-8">
                                Connect with the tools you already use. PROPMETRIK integrates with leading platforms to streamline your workflow.
                            </p>

                            <div className="space-y-6">
                                {[
                                    { name: 'WhatsApp Business', desc: 'Send updates and confirmations' },
                                    { name: 'Google Calendar', desc: 'Sync viewing appointments' },
                                    { name: 'Zoom', desc: 'Virtual property tours' },
                                    { name: 'Payment Gateways', desc: 'Accept deposits online' },
                                    { name: 'Email Marketing', desc: 'Automated drip campaigns' },
                                ].map((integration, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex items-start gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-lg"
                                    >
                                        <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center shrink-0">
                                            <CheckCircle2 className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white mb-1">{integration.name}</div>
                                            <div className="text-sm text-zinc-400">{integration.desc}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="relative aspect-square"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-yellow-400/20 rounded-lg blur-3xl" />
                            <div className="relative bg-zinc-950 border border-zinc-800 rounded-lg p-8 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="text-6xl mb-4">🔗</div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Connect Everything</h3>
                                    <p className="text-zinc-400">One platform, infinite possibilities</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <PremiumCTASection
                title="Ready to Transform Your Workflow?"
                description="Join hundreds of Ghanaian real estate professionals who've accelerated their sales with PROPMETRIK Deal Management."
                primaryCTA={{
                    text: "Start Free Trial",
                    href: "/signup"
                }}
                secondaryCTA={{
                    text: "Request Demo",
                    href: "/contact"
                }}
                backgroundImage="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1920&q=80"
            />
        </main>
    );
}
