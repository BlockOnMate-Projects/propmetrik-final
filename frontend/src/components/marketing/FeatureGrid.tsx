'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const features = [
    {
        title: "Market Valuation",
        description: "AI-powered automated valuation models tailored for local Ghanaian market conditions with high confidence scoring.",
        link: "Learn More",
        href: "/services/valuation"
    },
    {
        title: "Market Intelligence",
        description: "Neighbourhood analytics, economic indicators, and rental yields built on verified land and transaction data.",
        link: "Explore Analytics",
        href: "/services/market-intelligence"
    },
    {
        title: "Deal Management",
        description: "End-to-end transaction support from lead capture to closing, designed for local real estate workflows.",
        link: "View Solutions",
        href: "/services/deal-management"
    },
    {
        title: "Project Management",
        description: "Task & milestone tracking, budget control, contractor management, and automated construction monitoring.",
        link: "Explore Projects",
        href: "/services/project-management"
    },
    {
        title: "Property Management",
        description: "Tenant & lease management, maintenance workflows, financial reporting, and owner distribution portals.",
        link: "View Property Tools",
        href: "/services/property-management"
    }
];

export default function FeatureGrid() {
    return (
        <section className="py-32 bg-muted text-foreground">
            <div className="container mx-auto px-4 md:px-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.2, duration: 0.6 }}
                            className="group relative"
                        >
                            <Link href={feature.href} className="block h-full">
                                <div className="absolute top-0 left-0 w-12 h-1 bg-amber-500 mb-8" />
                                <h3 className="text-3xl font-bold mb-6 mt-10 tracking-tight text-foreground group-hover:text-amber-600 transition-colors duration-300">
                                    {feature.title}
                                </h3>
                                <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                                    {feature.description}
                                </p>
                                <span className="text-sm font-bold uppercase tracking-widest border-b-2 border-transparent group-hover:border-amber-600 pb-1 inline-block transition-all duration-300 cursor-pointer">
                                    {feature.link}
                                </span>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
