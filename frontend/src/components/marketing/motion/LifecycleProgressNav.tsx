'use client';

import { motion } from 'framer-motion';

export interface LifecycleStageTab {
    id: string;
    label: string;
    icon: React.ReactNode;
}

interface LifecycleProgressNavProps {
    stages: LifecycleStageTab[];
    activeStage: number;
    onStageChange: (index: number) => void;
}

export default function LifecycleProgressNav({
    stages,
    activeStage,
    onStageChange,
}: LifecycleProgressNavProps) {
    return (
        <div className="relative">
            {/* Connector line track */}
            <div className="absolute top-5 left-0 right-0 h-px bg-muted pointer-events-none" />

            {/* Filled progress line */}
            <motion.div
                className="absolute top-5 left-0 h-px bg-gradient-to-r from-amber-500 to-amber-400 pointer-events-none"
                animate={{
                    width: `${(activeStage / (stages.length - 1)) * 100}%`,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />

            {/* Stage tabs */}
            <div className="flex items-start justify-between relative">
                {stages.map((stage, i) => {
                    const isPast = i < activeStage;
                    const isActive = i === activeStage;
                    const isFuture = i > activeStage;

                    return (
                        <button
                            key={stage.id}
                            onClick={() => onStageChange(i)}
                            className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
                            style={{ minWidth: 0, flex: '1 1 0' }}
                            aria-label={`Go to ${stage.label}`}
                        >
                            {/* Circle node */}
                            <motion.div
                                animate={{
                                    backgroundColor: isActive
                                        ? '#f59e0b'
                                        : isPast
                                            ? '#d97706'
                                            : '#27272a',
                                    boxShadow: isActive
                                        ? '0 0 0 4px rgba(245,158,11,0.2), 0 0 16px rgba(245,158,11,0.4)'
                                        : 'none',
                                    scale: isActive ? 1.15 : 1,
                                }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                className="w-10 h-10 rounded-full flex items-center justify-center border-2 relative z-10"
                                style={{
                                    borderColor: isActive
                                        ? '#f59e0b'
                                        : isPast
                                            ? '#d97706'
                                            : '#3f3f46',
                                }}
                            >
                                <motion.span
                                    animate={{
                                        color: isActive || isPast ? '#0a0a0b' : '#71717a',
                                    }}
                                    className="w-5 h-5 flex items-center justify-center"
                                >
                                    {stage.icon}
                                </motion.span>

                                {/* Past stage check */}
                                {isPast && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute inset-0 flex items-center justify-center"
                                    >
                                        <svg
                                            className="w-4 h-4 text-zinc-950"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* Label */}
                            <motion.span
                                animate={{
                                    color: isActive ? '#f59e0b' : isPast ? '#a1a1aa' : '#52525b',
                                    fontWeight: isActive ? 700 : 500,
                                }}
                                className="text-[11px] uppercase tracking-wider text-center leading-tight hidden sm:block"
                                style={{ fontSize: '0.65rem' }}
                            >
                                {stage.label}
                            </motion.span>

                            {/* Active underline indicator */}
                            <motion.div
                                animate={{
                                    width: isActive ? '100%' : '0%',
                                    opacity: isActive ? 1 : 0,
                                }}
                                className="h-0.5 bg-amber-400 rounded-full"
                                style={{ maxWidth: '80px' }}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
