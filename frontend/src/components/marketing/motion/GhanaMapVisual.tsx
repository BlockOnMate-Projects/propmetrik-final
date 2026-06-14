'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Location {
    name: string;
    x: number; // Percentage from left
    y: number; // Percentage from top
    properties: number;
}

const ghanaLocations: Location[] = [
    { name: 'Accra', x: 55, y: 75, properties: 2500 },
    { name: 'Kumasi', x: 45, y: 45, properties: 1200 },
    { name: 'Takoradi', x: 25, y: 70, properties: 800 },
    { name: 'Tema', x: 58, y: 72, properties: 600 },
    { name: 'Cape Coast', x: 35, y: 75, properties: 450 },
    { name: 'Tamale', x: 50, y: 20, properties: 350 },
];

export default function GhanaMapVisual() {
    const [activeLocation, setActiveLocation] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveLocation((prev) => (prev + 1) % ghanaLocations.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="dark relative w-full aspect-square max-w-xl mx-auto bg-background rounded-xl border border-border overflow-hidden">
            <div className="absolute top-2 right-2 z-20 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5 bg-background/70">Illustrative</div>
            {/* Ghana Map Outline (SVG) */}
            <svg
                viewBox="0 0 400 500"
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Simplified Ghana outline */}
                <motion.path
                    d="M 100 50 L 150 30 L 220 25 L 270 40 L 300 80 L 310 150 L 305 220 L 280 290 L 250 350 L 200 420 L 150 450 L 100 420 L 70 350 L 50 280 L 45 200 L 55 120 Z"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="3"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                />

                <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#facc15" stopOpacity="0.8" />
                    </linearGradient>
                </defs>

                {/* Location Markers */}
                {ghanaLocations.map((location, index) => {
                    const cx = (location.x / 100) * 400;
                    const cy = (location.y / 100) * 500;
                    const isActive = index === activeLocation;

                    return (
                        <g key={location.name}>
                            {/* Pulsing Circle */}
                            <motion.circle
                                cx={cx}
                                cy={cy}
                                r={isActive ? 12 : 8}
                                fill="#f97316"
                                animate={{
                                    scale: isActive ? [1, 1.3, 1] : 1,
                                    opacity: isActive ? [0.8, 1, 0.8] : 0.6,
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            />

                            {/* Outer Ring */}
                            <motion.circle
                                cx={cx}
                                cy={cy}
                                r={20}
                                fill="none"
                                stroke="#f97316"
                                strokeWidth="2"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{
                                    scale: isActive ? [1, 1.5] : 0,
                                    opacity: isActive ? [0.6, 0] : 0,
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: isActive ? Infinity : 0,
                                    ease: "easeOut"
                                }}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Location Info Card */}
            <motion.div
                key={activeLocation}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-primary/30 rounded-lg px-6 py-3"
            >
                <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Coverage Area</div>
                    <div className="text-xl font-bold text-foreground">{ghanaLocations[activeLocation].name}</div>
                    <div className="text-sm text-primary">
                        {ghanaLocations[activeLocation].properties.toLocaleString()} properties
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
