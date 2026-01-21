'use client';

import { motion } from 'framer-motion';

export default function DealWorkflow() {
    return (
        <div className="relative w-full h-[400px] bg-card rounded-xl border border-border p-8 flex items-center justify-center overflow-hidden">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

            <div className="relative z-10 w-full max-w-lg flex justify-between items-center">
                {/* Steps */}
                {['Lead', 'Offer', 'Closing'].map((step, i) => (
                    <div key={i} className="flex flex-col items-center gap-4 relative">
                        <motion.div
                            className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${i === 2 ? 'border-primary bg-primary/20 text-primary' : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                                }`}
                            animate={i < 2 ? {
                                borderColor: ['#3f3f46', '#f59e0b', '#3f3f46']
                            } : {}}
                            transition={{ duration: 3, delay: i * 1, repeat: Infinity }}
                        >
                            {i + 1}
                        </motion.div>
                        <span className="text-sm font-bold uppercase tracking-wider">{step}</span>
                    </div>
                ))}

                {/* Connecting Line */}
                <div className="absolute top-8 left-8 right-8 h-[2px] bg-zinc-800 -z-10">
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 3, repeat: Infinity }}
                    />
                </div>

                {/* Moving Document Icon */}
                <motion.div
                    className="absolute top-4 w-8 h-10 bg-white rounded shadow-lg flex flex-col gap-1 p-1"
                    initial={{ left: '0%' }}
                    animate={{ left: '100%', opacity: [1, 1, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                >
                    <div className="h-1 w-full bg-zinc-300 rounded" />
                    <div className="h-1 w-2/3 bg-zinc-300 rounded" />
                </motion.div>
            </div>
        </div>
    );
}
