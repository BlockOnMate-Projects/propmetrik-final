'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const services = [
    {
        category: "Valuation & Advisory",
        href: "/services/valuation",
        items: [
            { title: "Automated Valuation Models (AVM)", desc: "Instant, AI-driven value estimates for residential properties." },
            { title: "Portfolio Revaluation", desc: "Batch processing for institutional portfolio tracking." },
            { title: "Development Appraisal", desc: "Feasibility studies for new construction projects." }
        ]
    },
    {
        category: "Deal Management",
        href: "/services/deal-management",
        items: [
            { title: "CRM for Agents", desc: "Lead tracking, property matching, and commission management." },
            { title: "Digital Closings", desc: "Document generation and e-signature workflows." },
            { title: "Inventory Management", desc: "Real-time availability tracking for developers." }
        ]
    },
    {
        category: "Project Management",
        href: "/services/project-management",
        items: [
            { title: "Task & Milestone Tracking", desc: "Gantt charts, critical path analysis, and automated dependency management." },
            { title: "Budget & Cost Control", desc: "Real-time budget tracking with draw schedules and change order management." },
            { title: "Contractor Management", desc: "Subcontractor onboarding, RFIs, submittals, and performance scorecards." }
        ]
    },
    {
        category: "Property Management",
        href: "/services/property-management",
        items: [
            { title: "Tenant & Lease Management", desc: "Automated rent collection, lease renewals, and tenant communication portals." },
            { title: "Maintenance & Work Orders", desc: "Request tracking, vendor dispatch, and preventive maintenance scheduling." },
            { title: "Financial Reporting", desc: "Income statements, expense tracking, and owner distribution reports." }
        ]
    },
    {
        category: "Market Intelligence",
        href: "/services/market-intelligence",
        items: [
            { title: "Neighborhood Analytics", desc: "Hyperlocal price trends, rental yields, and demographic data for every suburb." },
            { title: "Economic Indicators", desc: "GDP, inflation, interest rates, and their impact on property markets." },
            { title: "Custom Research Reports", desc: "On-demand market studies tailored to your investment thesis." }
        ]
    }
];

export default function ServicesPage() {
    return (
        <main className="pt-32 pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-4xl mb-24"
                >
                    <div className="inline-block px-3 py-1 mb-6 border border-amber-500/20 text-amber-500 rounded-full text-xs font-bold tracking-widest uppercase bg-amber-500/5">
                        Our Capabilities
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8">
                        Solutions for the <br />
                        Modern <span className="text-amber-500">Professional</span>
                    </h1>
                </motion.div>

                <div className="grid gap-24">
                    {services.map((section, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="grid md:grid-cols-12 gap-12 border-t border-border pt-12"
                        >
                            <div className="md:col-span-4">
                                <Link href={section.href} className="group">
                                    <h2 className="text-3xl font-bold tracking-tight group-hover:text-amber-500 transition-colors">
                                        {section.category}
                                    </h2>
                                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground mt-2 group-hover:text-amber-500 transition-colors">
                                        Learn more <ArrowRight className="w-4 h-4" />
                                    </span>
                                </Link>
                            </div>
                            <div className="md:col-span-8 grid sm:grid-cols-2 gap-12">
                                {section.items.map((item, i) => (
                                    <div key={i} className="space-y-3">
                                        <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                                        <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </main>
    );
}
