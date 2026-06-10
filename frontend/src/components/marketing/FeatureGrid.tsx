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
        title: "Data Intelligence",
        description: "A comprehensive property database for the region with verified title, land, and transaction data.",
        link: "Explore Data",
        href: "/services/data"
    },
    {
        title: "Deal Management",
        description: "End-to-end transaction support from lead capture to closing, designed for local real estate workflows.",
        link: "View Solutions",
        href: "/services/deal-management"
    }
];

export default function FeatureGrid() {
    return (
        <section className="py-32 bg-zinc-50 text-zinc-900">
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
                                <div className="absolute top-0 left-0 w-12 h-1 bg-zinc-900 mb-8" />
                                <h3 className="text-3xl font-bold mb-6 mt-10 tracking-tight group-hover:text-amber-600 transition-colors duration-300">
                                    {feature.title}
                                </h3>
                                <p className="text-zinc-600 text-lg mb-8 leading-relaxed">
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
