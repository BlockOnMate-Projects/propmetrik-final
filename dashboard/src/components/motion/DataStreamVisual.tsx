'use client';

import { motion } from 'framer-motion';

export default function DataStreamVisual() {
    const streams = Array.from({ length: 20 }, (_, i) => i);
    const dataPoints = Array.from({ length: 8 }, (_, i) => i);

    return (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-zinc-950 to-zinc-900">
            {/* Flowing Data Streams */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 450">
                {streams.map((_, index) => {
                    const delay = index * 0.2;
                    const yOffset = (index % 5) * 90;
                    const duration = 3 + (index % 3);

                    return (
                        <motion.path
                            key={index}
                            d={`M -100 ${100 + yOffset} Q 200 ${80 + yOffset}, 400 ${100 + yOffset} T 900 ${100 + yOffset}`}
                            fill="none"
                            stroke="url(#streamGradient)"
                            strokeWidth="2"
                            opacity="0.3"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{
                                duration,
                                delay,
                                repeat: Infinity,
                                ease: "linear"
                            }}
                        />
                    );
                })}

                <defs>
                    <linearGradient id="streamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
                        <stop offset="50%" stopColor="#f97316" stopOpacity="1" />
                        <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Glowing Data Points */}
            <div className="absolute inset-0 overflow-hidden">
                {dataPoints.map((_, index) => {
                    const randomX = 10 + (index * 12);
                    const randomY = 20 + ((index * 37) % 60);
                    const delay = index * 0.5;

                    return (
                        <motion.div
                            key={index}
                            className="absolute w-3 h-3 rounded-full bg-primary"
                            style={{
                                left: `${randomX}%`,
                                top: `${randomY}%`,
                                boxShadow: '0 0 20px rgba(249, 115, 22, 0.8)'
                            }}
                            animate={{
                                scale: [1, 1.5, 1],
                                opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                                duration: 2,
                                delay,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                        />
                    );
                })}
            </div>

            {/* Floating Stats */}
            <div className="absolute bottom-8 left-8 right-8">
                <div className="grid grid-cols-3 gap-4">
                    {['Real-time Data', 'AI Processing', 'Cloud Sync'].map((label, index) => (
                        <motion.div
                            key={label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.2 + 1 }}
                            className="text-center"
                        >
                            <motion.div
                                animate={{
                                    opacity: [0.5, 1, 0.5],
                                }}
                                transition={{
                                    duration: 2,
                                    delay: index * 0.3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                className="text-xs text-primary uppercase tracking-wider"
                            >
                                {label}
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
