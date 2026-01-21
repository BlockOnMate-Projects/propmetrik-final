'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PropertyShowcaseProps {
    imageUrl?: string;
    stats?: {
        label: string;
        value: string;
    }[];
}

export default function PropertyShowcase({
    imageUrl = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80',
    stats = [
        { label: 'Properties Valued', value: '5,000+' },
        { label: 'Accuracy Rate', value: '95%' },
        { label: 'Avg. Response Time', value: '<24hrs' }
    ]
}: PropertyShowcaseProps) {
    const [currentStat, setCurrentStat] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStat((prev) => (prev + 1) % stats.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [stats.length]);

    return (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-zinc-900">
            {/* Background Image with Animation */}
            <motion.div
                animate={{
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear"
                }}
                className="absolute inset-0"
            >
                <img
                    src={imageUrl}
                    alt="Property Showcase"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
            </motion.div>

            {/* Floating Stats */}
            <div className="absolute bottom-8 left-8 right-8 z-10">
                <div className="grid grid-cols-3 gap-4">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{
                                opacity: currentStat === index ? 1 : 0.5,
                                y: 0,
                                scale: currentStat === index ? 1.05 : 1
                            }}
                            transition={{ duration: 0.5 }}
                            className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-lg p-4"
                        >
                            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                            <div className="text-xs text-zinc-400 uppercase tracking-wider">{stat.label}</div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Animated Border */}
            <motion.div
                className="absolute inset-0 border-2 border-primary/50 rounded-lg"
                animate={{
                    opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
        </div>
    );
}
