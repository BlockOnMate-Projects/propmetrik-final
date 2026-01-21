'use client';

import { motion } from 'framer-motion';

export default function ValuationScanner() {
    return (
        <div className="relative w-full h-[400px] flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-900 overflow-hidden">
            {/* Radar Concentric Circles */}
            {[1, 2, 3].map((i) => (
                <motion.div
                    key={i}
                    className="absolute border border-primary/20 rounded-full"
                    style={{ width: i * 200, height: i * 200 }}
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
                    transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
                />
            ))}

            {/* Central House/Pin */}
            <div className="relative z-10 w-24 h-24 bg-zinc-900 rounded-xl flex items-center justify-center border border-primary shadow-[0_0_30px_rgba(var(--primary),0.3)]">
                <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-4xl text-primary font-bold"
                >
                    $
                </motion.div>
            </div>

            {/* Scanning Line */}
            <motion.div
                className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity }}
            />

            {/* Floating Data Points */}
            <motion.div
                className="absolute top-1/4 left-1/4 bg-zinc-800 text-xs px-3 py-1 rounded-full text-zinc-300 border border-zinc-700"
                animate={{ opacity: [0, 1, 0], x: [0, 20, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
            >
                Location: Premium
            </motion.div>

            <motion.div
                className="absolute bottom-1/3 right-1/4 bg-zinc-800 text-xs px-3 py-1 rounded-full text-zinc-300 border border-zinc-700"
                animate={{ opacity: [0, 1, 0], x: [0, -20, 0] }}
                transition={{ duration: 4, delay: 1, repeat: Infinity }}
            >
                Size: 450sqm
            </motion.div>
        </div>
    );
}
