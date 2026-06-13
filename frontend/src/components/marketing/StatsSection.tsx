'use client';

import { motion } from 'framer-motion';

// Capability highlights (NOT traction metrics). Kept deliberately qualitative so nothing
// here overstates scale before the numbers are real and API-backed.
const stats = [
    { value: "Ghana", label: "Market Focus" },
    { value: "AI-Powered", label: "Property Valuations" },
    { value: "Real-Time", label: "Market Data" },
    { value: "End-to-End", label: "Property Platform" },
];

export default function StatsSection() {
    return (
        <section className="py-24 bg-card text-foreground border-y border-border">
            <div className="container mx-auto px-4 md:px-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                            className="flex flex-col justify-center items-center"
                        >
                            <div className="text-5xl md:text-6xl font-bold mb-3 tracking-tighter">
                                {stat.value}
                            </div>
                            <div className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-[0.2em]">
                                {stat.label}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
