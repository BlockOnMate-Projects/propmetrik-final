'use client';

import { motion } from 'framer-motion';

export default function MarketTrendsVisual() {
    return (
        <div className="dark relative w-full h-[400px] bg-card rounded-xl border border-border p-6 overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 z-10">
                <div>
                    <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-3 w-20 bg-muted/50 rounded" />
                </div>
                <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">ILLUSTRATIVE</span>
                </div>
            </div>

            {/* Map Layer (Abstract Grid) */}
            <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-transparent" />
                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            </div>

            {/* Heatmap Hotspots */}
            <div className="absolute inset-0">
                {[
                    { top: '30%', left: '40%', delay: 0 },
                    { top: '60%', left: '70%', delay: 1.5 },
                    { top: '45%', left: '25%', delay: 0.8 },
                    { top: '20%', left: '60%', delay: 2.2 },
                ].map((point, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-24 h-24 bg-primary/20 rounded-full blur-xl"
                        style={{ top: point.top, left: point.left }}
                        animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.2, 0.5, 0.2]
                        }}
                        transition={{ duration: 4, delay: point.delay, repeat: Infinity, ease: "easeInOut" }}
                    />
                ))}
            </div>

            {/* Trend Lines Overlay */}
            <div className="relative z-10 flex-1 mt-auto">
                <svg className="w-full h-48 overflow-visible">
                    {/* Trend 1 */}
                    <motion.path
                        d="M0 150 C 100 140, 200 100, 300 120 S 450 80, 600 40"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="3"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 3, ease: "easeOut" }}
                    />
                    {/* Area under curve */}
                    <motion.path
                        d="M0 150 C 100 140, 200 100, 300 120 S 450 80, 600 40 L 600 200 L 0 200 Z"
                        fill="url(#gradient)"
                        opacity="0.2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.2 }}
                        transition={{ delay: 1, duration: 2 }}
                    />
                    <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" />
                            <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* Floating Insight Bubbles */}
            <motion.div
                className="absolute top-1/4 left-1/3 bg-card/90 border border-border px-3 py-2 rounded-lg text-xs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.5 }}
            >
                <span className="text-muted-foreground mr-2">Demand</span>
                <span className="text-primary font-bold">High</span>
            </motion.div>
        </div>
    );
}
