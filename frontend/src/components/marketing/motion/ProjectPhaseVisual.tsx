'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Phase {
    name: string;
    duration: string;
    items: string[];
    color: string;
}

const PHASES: Phase[] = [
    {
        name: 'Planning',
        duration: '2-4 weeks',
        items: ['Feasibility Study', 'Budget Approval', 'Team Assembly', 'Permit Filing'],
        color: '#f59e0b',
    },
    {
        name: 'Design',
        duration: '4-8 weeks',
        items: ['Architectural Draft', 'Structural Eng.', 'MEP Design', 'Client Review'],
        color: '#3b82f6',
    },
    {
        name: 'Construction',
        duration: '12-24 weeks',
        items: ['Foundation', 'Superstructure', 'Envelope', 'Rough-Ins'],
        color: '#10b981',
    },
    {
        name: 'Handover',
        duration: '2-4 weeks',
        items: ['QA Inspection', 'Punch List', 'Commissioning', 'Client Sign-Off'],
        color: '#a855f7',
    },
];

export default function ProjectPhaseVisual() {
    const [activePhase, setActivePhase] = useState(0);
    const [activeItem, setActiveItem] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveItem(prev => {
                const maxItems = PHASES[activePhase].items.length - 1;
                if (prev >= maxItems) {
                    setActivePhase(p => (p + 1) % PHASES.length);
                    return 0;
                }
                return prev + 1;
            });
        }, 1800);
        return () => clearInterval(interval);
    }, [activePhase]);

    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 p-8">
            {/* Phase selector */}
            <div className="flex gap-1 mb-8">
                {PHASES.map((phase, i) => (
                    <button
                        key={phase.name}
                        onClick={() => { setActivePhase(i); setActiveItem(0); }}
                        className="flex-1 relative"
                    >
                        <motion.div
                            className="h-1.5 rounded-full"
                            style={{ backgroundColor: activePhase >= i ? phase.color : '#27272a' }}
                            animate={{ scaleX: activePhase === i ? [0.95, 1, 0.95] : 1 }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <div className={`text-[10px] font-mono mt-2 transition-colors ${
                            activePhase === i ? 'text-white' : 'text-zinc-600'
                        }`}>
                            {phase.name}
                        </div>
                    </button>
                ))}
            </div>

            {/* Active Phase Detail */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activePhase}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <motion.div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: PHASES[activePhase].color }}
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <h3 className="text-2xl font-bold text-white">{PHASES[activePhase].name}</h3>
                        <span className="text-xs text-zinc-500 font-mono ml-auto">{PHASES[activePhase].duration}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {PHASES[activePhase].items.map((item, i) => (
                            <motion.div
                                key={item}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{
                                    opacity: 1,
                                    x: 0,
                                    scale: activeItem === i ? 1.02 : 1,
                                }}
                                transition={{ delay: i * 0.1, duration: 0.3 }}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                    activeItem === i
                                        ? 'border-amber-500/50 bg-amber-500/5'
                                        : i < activeItem
                                            ? 'border-zinc-700 bg-zinc-900/50'
                                            : 'border-zinc-800 bg-transparent'
                                }`}
                            >
                                <div
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        i < activeItem
                                            ? 'border-emerald-500 bg-emerald-500'
                                            : activeItem === i
                                                ? 'border-amber-500'
                                                : 'border-zinc-700'
                                    }`}
                                >
                                    {i < activeItem && (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {activeItem === i && (
                                        <motion.div
                                            className="w-2 h-2 bg-amber-500 rounded-full"
                                            animate={{ scale: [0.8, 1.2, 0.8] }}
                                            transition={{ duration: 1, repeat: Infinity }}
                                        />
                                    )}
                                </div>
                                <span className={`text-sm font-mono ${
                                    activeItem === i ? 'text-white' : i < activeItem ? 'text-zinc-400' : 'text-zinc-600'
                                }`}>
                                    {item}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Decorative connection lines */}
            <svg className="absolute top-20 right-6 w-16 h-32 opacity-20" viewBox="0 0 64 128">
                <motion.path
                    d="M 32 0 L 32 128"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    fill="none"
                    animate={{ strokeDashoffset: [0, -16] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
            </svg>
        </div>
    );
}
