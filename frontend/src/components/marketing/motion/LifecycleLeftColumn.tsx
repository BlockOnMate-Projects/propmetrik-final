'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { StageData } from './LifecycleStageCard';

interface LifecycleLeftColumnProps {
    stage: StageData;
    stageIndex: number;
    totalStages: number;
}

export default function LifecycleLeftColumn({
    stage,
    stageIndex,
    totalStages,
}: LifecycleLeftColumnProps) {
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -24, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -16, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex flex-col justify-center h-full"
            >
                {/* Stage counter */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center gap-2">
                        {Array.from({ length: totalStages }).map((_, i) => (
                            <motion.div
                                key={i}
                                animate={{
                                    width: i === stageIndex ? 24 : 6,
                                    backgroundColor:
                                        i === stageIndex
                                            ? '#f59e0b'
                                            : i < stageIndex
                                                ? '#d97706'
                                                : '#27272a',
                                }}
                                transition={{ duration: 0.3 }}
                                className="h-1.5 rounded-full"
                            />
                        ))}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                        Stage {stageIndex + 1} of {totalStages}
                    </span>
                </div>

                {/* Stage label pill */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full border border-amber-500/30 bg-amber-500/5 w-fit"
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                        {stage.label}
                    </span>
                </motion.div>

                {/* Headline */}
                <motion.h2
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-3xl md:text-4xl xl:text-5xl font-bold text-foreground leading-tight tracking-tight mb-5"
                >
                    {stage.headline}
                </motion.h2>

                {/* Copy */}
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="text-base text-muted-foreground leading-relaxed mb-8 max-w-md"
                >
                    {stage.copy}
                </motion.p>

                {/* Anchor metric */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-8 p-5 rounded-xl border border-amber-500/15 bg-amber-500/5"
                >
                    <div className="text-4xl font-bold font-mono text-amber-600 dark:text-amber-400 leading-none mb-1">
                        {stage.anchorMetric.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {stage.anchorMetric.descriptor}
                    </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 }}
                >
                    <Link href={stage.ctaHref}>
                        <motion.button
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.97 }}
                            className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:text-amber-300 transition-colors group"
                        >
                            {stage.ctaLabel}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </motion.button>
                    </Link>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
