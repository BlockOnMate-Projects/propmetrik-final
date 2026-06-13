'use client';

import { motion } from 'framer-motion';

export default function AnalyticsVisual() {
    return (
        <div className="relative w-full h-[400px] bg-card rounded-xl border border-border p-6 overflow-hidden flex flex-col gap-6 shadow-2xl">
            {/* Header UI */}
            <div className="flex justify-between items-center mb-2">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="flex gap-2">
                    <div className="h-8 w-24 bg-primary/20 rounded" />
                    <div className="h-8 w-8 bg-muted rounded" />
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 relative flex items-end gap-2 px-4 pb-4">
                {/* Animated Bars */}
                {[30, 50, 45, 70, 60, 85, 95].map((height, i) => (
                    <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{
                            duration: 1.5,
                            delay: i * 0.1,
                            repeat: Infinity,
                            repeatType: "reverse",
                            repeatDelay: 3
                        }}
                        className="flex-1 bg-gradient-to-t from-primary/20 to-primary rounded-t-sm relative group"
                    >
                        {/* Tooltip on hover simulation */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 2, delay: i * 0.2 + 2, repeat: Infinity, repeatDelay: 5 }}
                            className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap"
                        >
                            ${(height * 1000).toLocaleString()}
                        </motion.div>
                    </motion.div>
                ))}

                {/* Line Graph Overlay */}
                <svg className="absolute inset-x-4 bottom-4 h-full overflow-visible pointer-events-none">
                    <motion.path
                        d="M0 300 C 50 250, 100 200, 150 220 S 250 150, 300 100 S 400 50, 500 20"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="3"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 3 }}
                    />
                </svg>
            </div>

            {/* Floating Insight Cards */}
            <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-12 right-12 w-48 bg-card/90 backdrop-blur border border-primary/30 p-4 rounded-lg shadow-xl"
            >
                <div className="text-xs text-muted-foreground mb-1">Market Trend</div>
                <div className="text-2xl font-bold text-foreground flex items-center gap-2">
                    +12.5%
                    <span className="text-emerald-500 text-sm">▲</span>
                </div>
            </motion.div>

            <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-24 left-12 w-48 bg-card/90 backdrop-blur border border-primary/30 p-4 rounded-lg shadow-xl"
            >
                <div className="text-xs text-muted-foreground mb-1">Avg. Yield</div>
                <div className="text-2xl font-bold text-foreground">
                    8.4%
                </div>
            </motion.div>
        </div>
    );
}
