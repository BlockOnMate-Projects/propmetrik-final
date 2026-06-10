'use client';

import { motion } from 'framer-motion';

export interface DataTile {
    value: string;
    label: string;
    sub?: string;
    color?: 'amber' | 'emerald' | 'blue' | 'red' | 'white';
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'mid-right' | 'mid-left';
    badge?: string;
}

export interface StageData {
    id: string;
    label: string;
    image: string;
    imageAlt: string;
    headline: string;
    copy: string;
    anchorMetric: {
        value: string;
        descriptor: string;
    };
    ctaLabel: string;
    ctaHref: string;
    dataTiles: DataTile[];
}

interface LifecycleStageCardProps {
    stage: StageData;
    depth: number; // 0 = foreground active, 1+ = behind
    isActive: boolean;
}

const COLOR_MAP = {
    amber: {
        value: 'text-amber-400',
        badge: 'bg-amber-400/20 text-amber-400 border-amber-400/30',
        dot: 'bg-amber-400',
    },
    emerald: {
        value: 'text-emerald-400',
        badge: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
        dot: 'bg-emerald-400',
    },
    blue: {
        value: 'text-blue-400',
        badge: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
        dot: 'bg-blue-400',
    },
    red: {
        value: 'text-red-400',
        badge: 'bg-red-400/20 text-red-400 border-red-400/30',
        dot: 'bg-red-400',
    },
    white: {
        value: 'text-white',
        badge: 'bg-white/10 text-white border-white/20',
        dot: 'bg-white',
    },
};

const POSITION_CLASSES: Record<DataTile['position'], string> = {
    'top-left': 'top-6 left-6',
    'top-right': 'top-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'bottom-right': 'bottom-6 right-6',
    'mid-right': 'top-1/2 -translate-y-1/2 right-6',
    'mid-left': 'top-1/2 -translate-y-1/2 left-6',
};

export default function LifecycleStageCard({ stage, depth, isActive }: LifecycleStageCardProps) {
    // Compute visual transforms based on depth
    const scale = 1 - depth * 0.055;
    const translateX = depth * 52;
    const opacity = Math.max(0, 1 - depth * 0.22);
    const zIndex = 10 - depth;

    return (
        <motion.div
            animate={{
                scale,
                x: translateX,
                opacity,
                filter: depth > 0 ? `brightness(${1 - depth * 0.18})` : 'brightness(1)',
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            style={{ zIndex, transformOrigin: 'top right' }}
            className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
        >
            {/* Background image */}
            <div className="absolute inset-0">
                <img
                    src={stage.image}
                    alt={stage.imageAlt}
                    className="w-full h-full object-cover"
                    style={{
                        filter: depth > 0 ? `saturate(${1 - depth * 0.2})` : 'saturate(1)',
                    }}
                />
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/60 via-transparent to-transparent" />
            </div>

            {/* Border frame */}
            <div
                className="absolute inset-0 rounded-2xl"
                style={{
                    boxShadow: isActive
                        ? '0 0 0 1px rgba(245,158,11,0.4), inset 0 0 0 1px rgba(245,158,11,0.08)'
                        : '0 0 0 1px rgba(255,255,255,0.08)',
                }}
            />

            {/* Data tiles — only animate when active */}
            {stage.dataTiles.map((tile, i) => {
                const colorSet = COLOR_MAP[tile.color ?? 'amber'];
                return (
                    <motion.div
                        key={tile.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{
                            opacity: isActive ? 1 : 0,
                            y: isActive ? 0 : 8,
                        }}
                        transition={{ delay: isActive ? 0.3 + i * 0.12 : 0, duration: 0.4 }}
                        className={`absolute ${POSITION_CLASSES[tile.position]}`}
                    >
                        <div
                            className="rounded-xl px-4 py-3 min-w-[140px]"
                            style={{
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                background: 'rgba(9,9,11,0.7)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            }}
                        >
                            {tile.badge && (
                                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-2 ${colorSet.badge}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${colorSet.dot}`} />
                                    {tile.badge}
                                </div>
                            )}
                            <div className={`text-xl font-bold font-mono leading-none ${colorSet.value}`}>
                                {tile.value}
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-1 font-medium">
                                {tile.label}
                            </div>
                            {tile.sub && (
                                <div className="text-[10px] text-zinc-600 mt-0.5">
                                    {tile.sub}
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
            })}

            {/* Active pulse indicator */}
            {isActive && (
                <motion.div
                    className="absolute top-4 left-4 flex items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <motion.div
                        className="w-2 h-2 rounded-full bg-emerald-400"
                        animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                    />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                        Active
                    </span>
                </motion.div>
            )}

            {/* Depth darkening overlay when stacked */}
            {depth > 0 && (
                <div
                    className="absolute inset-0 bg-zinc-950 rounded-2xl pointer-events-none"
                    style={{ opacity: Math.min(depth * 0.15, 0.5) }}
                />
            )}
        </motion.div>
    );
}
