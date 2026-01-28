'use client';

import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface StatsCounterProps {
    value: number;
    label: string;
    suffix?: string;
    prefix?: string;
    duration?: number;
}

export default function StatsCounter({
    value,
    label,
    suffix = '',
    prefix = '',
    duration = 2
}: StatsCounterProps) {
    const count = useMotionValue(0);
    const [displayValue, setDisplayValue] = useState('0');
    const [hasAnimated, setHasAnimated] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = count.on('change', (latest) => {
            if (value >= 1000) {
                setDisplayValue(Math.round(latest).toLocaleString());
            } else {
                setDisplayValue(Math.round(latest).toString());
            }
        });
        return unsubscribe;
    }, [count, value]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasAnimated) {
                    const controls = animate(count, value, { duration });
                    setHasAnimated(true);
                    return () => controls.stop();
                }
            },
            { threshold: 0.5 }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, [count, value, duration, hasAnimated]);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
        >
            <div className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400 mb-2">
                {prefix}{displayValue}{suffix}
            </div>
            <div className="text-sm md:text-base text-zinc-400 uppercase tracking-wider">
                {label}
            </div>
        </motion.div>
    );
}
