'use client';

import { motion } from 'framer-motion';

export default function AboutPage() {
    return (
        <main className="pt-32 pb-24">
            <div className="container mx-auto px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-4xl mx-auto text-center mb-24"
                >
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8">
                        Building Trust in <br />
                        <span className="text-primary">African Real Estate</span>
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        PROPMETRIK is on a mission to formalize and digitize Ghana's real estate ecosystem through reliable data, transparent valuations, and intelligent tools.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-2 gap-16 items-center mb-32">
                    <div className="relative h-[600px] w-full bg-zinc-900 rounded-lg overflow-hidden">
                        {/* Placeholder for About Image - referencing diverse professional team */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent" />
                        <div className="absolute bottom-8 left-8 right-8">
                            <div className="text-6xl font-bold text-white mb-2">2026</div>
                            <div className="text-sm uppercase tracking-widest text-zinc-400">Founded in Accra</div>
                        </div>
                    </div>

                    <div className="space-y-12">
                        <div>
                            <h3 className="text-2xl font-bold mb-4">Our Vision</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                To become the definitive operating system for real estate in West Africa, creating a market where every property has a known value, verified history, and liquid future.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold mb-4">The Problem</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                For decades, the market has suffered from opacity. Buyers doubt prices, banks fear collateral, and developers guess demand. We are replacing guesswork with granular, verified intelligence.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold mb-4">Our Approach</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                We combine boots-on-the-ground data collection with advanced AI valuations. We don't just aggregate listings; we verify facts, standardize records, and build the digital infrastructure for the future.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
