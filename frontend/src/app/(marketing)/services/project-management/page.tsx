'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, BarChart3, Shield, Users, Calendar, DollarSign, Layers } from 'lucide-react';
import ProjectDashboardVisual from '@/components/marketing/motion/ProjectDashboardVisual';
import ProcessTimeline from '@/components/marketing/motion/ProcessTimeline';
import StatsCounter from '@/components/marketing/motion/StatsCounter';
import PremiumCTASection from '@/components/marketing/motion/PremiumCTASection';
import ProjectLifecycleSection from '@/components/marketing/motion/ProjectLifecycleSection';

export default function ProjectManagementPage() {
    const capabilities = [
        {
            icon: <ClipboardList className="w-6 h-6" />,
            title: 'Task & Milestone Tracking',
            description: 'Gantt charts, critical path analysis, and automated dependency management for every phase of construction.',
        },
        {
            icon: <DollarSign className="w-6 h-6" />,
            title: 'Budget & Cost Control',
            description: 'Real-time budget tracking with draw schedules, change order management, and variance alerts.',
        },
        {
            icon: <Users className="w-6 h-6" />,
            title: 'Contractor Management',
            description: 'Subcontractor onboarding, RFIs, submittals, and performance scorecards across every trade.',
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: 'Safety & Compliance',
            description: 'Incident tracking, daily safety logs, and automated compliance checklists aligned with Ghana EPA standards.',
        },
        {
            icon: <BarChart3 className="w-6 h-6" />,
            title: 'Progress Reporting',
            description: 'Automated weekly reports with photo documentation, earned-value metrics, and stakeholder dashboards.',
        },
        {
            icon: <Calendar className="w-6 h-6" />,
            title: 'Schedule Optimization',
            description: 'AI-powered schedule forecasting that learns from weather, supply chain delays, and local market patterns.',
        },
    ];

    const useCases = [
        {
            title: 'Residential Developments',
            description: 'Manage apartments, townhouses, and estate developments from land acquisition through handover.',
            features: [
                'Multi-block phased delivery management',
                'Unit-level finishing & QA checklists',
                'Buyer communication portal',
                'Warranty period tracking',
            ],
        },
        {
            title: 'Commercial Construction',
            description: 'Coordinate complex office, retail, and mixed-use projects with multiple stakeholders.',
            features: [
                'Tenant fit-out coordination',
                'LEED / Green Star tracking',
                'Multi-discipline document control',
                'Commissioning workflow',
            ],
        },
        {
            title: 'Infrastructure & Civil',
            description: 'Roads, bridges, utilities, and public works managed with full government compliance.',
            features: [
                'Works certification & payment certs',
                'Environmental impact monitoring',
                'As-built documentation',
                'Retention release scheduling',
            ],
        },
    ];

    const timeline = [
        {
            title: 'Create Project & Budget',
            description: 'Import plans, define phases, set milestones, and lock in your cost baseline within minutes.',
        },
        {
            title: 'Assign Teams & Contractors',
            description: 'Invite subcontractors, assign trades to phases, and establish approval workflows.',
        },
        {
            title: 'Track Progress in Real-Time',
            description: 'Field teams log daily updates via mobile — tasks, photos, safety, and material deliveries.',
        },
        {
            title: 'Report & Hand Over',
            description: 'Auto-generated progress reports, punch-list closeout, and final commissioning documentation.',
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
                            src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1920&q=80"
                            alt="Construction site"
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
                            Project Management
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
                            Build Smarter,{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Deliver Faster
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-3xl mb-12">
                            End-to-end construction and development project management — from feasibility study to final handover — purpose-built for Ghana&apos;s real estate market.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
                            <StatsCounter value={150} label="Projects Managed" suffix="+" />
                            <StatsCounter value={98} label="On-Time Delivery" suffix="%" />
                            <StatsCounter value={12} label="Avg. Cost Savings" suffix="%" />
                            <StatsCounter value={350} label="Contractors On-Platform" suffix="+" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/signup?category=project_management">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 px-8 py-4 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    Start Free Trial
                                </motion.button>
                            </Link>
                            <Link href="/pricing?category=project_management">
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

            {/* ====== Motion-Picture Lifecycle Section ====== */}
            <ProjectLifecycleSection />

            {/* ====== Live Dashboard Visual ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            Real-Time Project Intelligence
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Every task, budget line, and safety metric — visible in one live dashboard.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <ProjectDashboardVisual />
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
                            Everything You Need to Deliver
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Purpose-built tools for Ghana&apos;s construction industry — not retrofitted software from overseas.
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

            {/* Phase-by-phase detail callout — simplified since lifecycle section above covers the journey */}
            <section className="py-20 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                                Phase-by-Phase{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    Control
                                </span>
                            </h2>
                            <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                                From planning through handover, every phase is tracked with dependencies, approvals, and gated milestones. No phase starts until the prior one is signed off.
                            </p>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.15 }}
                            className="grid grid-cols-1 gap-4"
                        >
                            {[
                                'Automated phase-gate approvals with audit trail',
                                'Dependency mapping prevents out-of-sequence work',
                                'Weather and supply-chain delay intelligence',
                                'Client-facing progress portal with photo timelines',
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: 10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.1 + i * 0.08 }}
                                    className="flex items-start gap-3 p-4 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-primary/40 transition-colors"
                                >
                                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <span className="text-zinc-300 text-sm">{item}</span>
                                </motion.div>
                            ))}
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
                            Built for Every Project Type
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Whether 10 units or 10 storeys, our platform adapts to scope and complexity.
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

            {/* ====== Integration Strip ====== */}
            <section className="py-16 bg-zinc-900 border-y border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-center mb-8"
                    >
                        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
                            Integrated with the PROPMETRIK platform
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { icon: <Layers className="w-5 h-5" />, title: 'Valuations', desc: 'Auto-update asset values as projects progress' },
                            { icon: <DollarSign className="w-5 h-5" />, title: 'Invoicing', desc: 'Generate contractor payment certificates' },
                            { icon: <BarChart3 className="w-5 h-5" />, title: 'Data Intelligence', desc: 'Feed project data into market analytics' },
                            { icon: <Users className="w-5 h-5" />, title: 'CRM & Deals', desc: 'Link projects to buyer pipelines' },
                        ].map((item, i) => (
                            <motion.div
                                key={item.title}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="text-center p-4"
                            >
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-primary mx-auto mb-3">
                                    {item.icon}
                                </div>
                                <div className="text-sm font-bold text-white mb-1">{item.title}</div>
                                <div className="text-xs text-zinc-500">{item.desc}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== How It Works ====== */}
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
                            Get from project kick-off to handover in four clear stages.
                        </p>
                    </motion.div>
                    <ProcessTimeline steps={timeline} />
                </div>
            </section>

            {/* ====== Pricing Teaser ====== */}
            <section className="py-24 bg-zinc-900">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto mb-12"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Simple, Transparent Pricing
                        </h2>
                        <p className="text-xl text-zinc-400">
                            Choose the plan that matches your project volume.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {[
                            {
                                tier: 'Starter',
                                price: 'GHS 325',
                                audience: 'Small developers',
                                features: ['Up to 3 active projects', '10 team members', 'Gantt charts & milestones', 'Budget tracking', 'Mobile app access'],
                            },
                            {
                                tier: 'Professional',
                                price: 'GHS 650',
                                audience: 'Growing firms',
                                features: ['Up to 15 active projects', '50 team members', 'Contractor management', 'RFI & submittal tracking', 'Custom report templates', 'API access'],
                                featured: true,
                            },
                            {
                                tier: 'Enterprise',
                                price: 'GHS 1,300',
                                audience: 'Large organizations',
                                features: ['Unlimited projects', 'Unlimited users', 'Multi-org portfolios', 'AI schedule forecasting', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
                            },
                        ].map((plan, i) => (
                            <motion.div
                                key={plan.tier}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className={`relative rounded-xl p-8 border transition-colors ${plan.featured
                                        ? 'bg-zinc-950 border-primary/50 ring-1 ring-primary/20'
                                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
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
                                <Link href={`/signup?plan=proj-${plan.tier.toLowerCase()}&category=project_management`}>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`w-full mt-8 py-3 font-bold uppercase tracking-wider text-sm transition-colors ${plan.featured
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
                title="Ready to Modernize Your Next Project?"
                description="Join developers across Ghana who trust PROPMETRIK to deliver on time, on budget, and with full visibility."
                primaryCTA={{
                    text: 'Start Free Trial',
                    href: '/signup?category=project_management',
                }}
                secondaryCTA={{
                    text: 'Book a Demo',
                    href: '/contact',
                }}
                backgroundImage="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1920&q=80"
            />
        </main>
    );
}
