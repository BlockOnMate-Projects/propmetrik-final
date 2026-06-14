'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HeroSection() {
    return (
        <section className="relative h-screen w-full overflow-hidden flex items-center justify-center bg-background text-foreground">
            {/* Background with abstract motion */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-r from-background/90 to-background/50 z-10" />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        rotate: [0, 1, -1, 0],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="w-full h-full bg-[url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-40"
                />
            </div>

            <div className="container mx-auto relative z-20 px-4 md:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="max-w-4xl"
                >
                    <div className="inline-block px-3 py-1 mb-6 border border-border rounded-full text-xs font-medium tracking-wider uppercase bg-card/50 backdrop-blur-sm">
                        Market Intelligence Platform
                    </div>
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 leading-tight">
                        INTELLIGENCE <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
                            REDEFINED.
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-light">
                        PROPMETRIK delivers confident valuations, verified data, and institutional-grade analytics for the Ghanaian market.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Link href="/services/data">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="bg-foreground text-background px-8 py-4 text-sm font-bold tracking-widest uppercase hover:opacity-90 transition-colors"
                            >
                                Explore Data Hub
                            </motion.button>
                        </Link>
                        <Link href="/pricing">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="bg-transparent border border-border text-foreground px-8 py-4 text-sm font-bold tracking-widest uppercase hover:bg-card transition-colors"
                            >
                                Request Demo
                            </motion.button>
                        </Link>
                    </div>
                </motion.div>
            </div>

            {/* Decorative clean lines */}
            <div className="absolute bottom-0 left-0 w-full h-px bg-muted" />
            <div className="absolute bottom-0 right-10 w-px h-32 bg-muted" />
        </section>
    );
}
