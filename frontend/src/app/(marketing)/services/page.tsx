'use client';

import { motion } from 'framer-motion';

const services = [
    {
        category: "Valuation & Advisory",
        items: [
            { title: "Automated Valuation Models (AVM)", desc: "Instant, AI-driven value estimates for residential properties." },
            { title: "Portfolio Revaluation", desc: "Batch processing for institutional portfolio tracking." },
            { title: "Development Appraisal", desc: "Feasibility studies for new construction projects." }
        ]
    },
    {
        category: "Data Intelligence",
        items: [
            { title: "Market Comparables", desc: "Verified transaction data vs asking prices." },
            { title: "Land Title Search", desc: "Integration with Lands Commission records (Phase 2)." },
            { title: "Construction Cost Index", desc: "Real-time tracking of material and labor costs." }
        ]
    },
    {
        category: "Deal Management",
        items: [
            { title: "CRM for Agents", desc: "Lead tracking, property matching, and commission management." },
            { title: "Digital Closings", desc: "Document generation and e-signature workflows." },
            { title: "Inventory Management", desc: "Real-time availability tracking for developers." }
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
                            className="grid md:grid-cols-12 gap-12 border-t border-zinc-800 pt-12"
                        >
                            <div className="md:col-span-4">
                                <h2 className="text-3xl font-bold tracking-tight">{section.category}</h2>
                            </div>
                            <div className="md:col-span-8 grid sm:grid-cols-2 gap-12">
                                {section.items.map((item, i) => (
                                    <div key={i} className="space-y-3">
                                        <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                                        <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
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
