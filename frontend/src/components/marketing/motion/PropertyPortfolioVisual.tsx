'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Demo stats are FIXED per property (not Math.random) so the server-rendered HTML matches
// the client on hydration — random-per-render values cause a React hydration mismatch.
const properties = [
    { name: 'Cantonments Heights', type: 'Residential', units: 24, occupancy: 96, revenue: 'GHS 38,400', status: 'healthy', tickets: 2, renewals: 3, overdue: 0 },
    { name: 'Osu Oxford Plaza', type: 'Commercial', units: 12, occupancy: 100, revenue: 'GHS 62,000', status: 'healthy', tickets: 1, renewals: 1, overdue: 0 },
    { name: 'Airport West Villas', type: 'Residential', units: 8, occupancy: 88, revenue: 'GHS 14,200', status: 'attention', tickets: 3, renewals: 2, overdue: 1 },
    { name: 'Ring Road Retail', type: 'Retail', units: 18, occupancy: 72, revenue: 'GHS 28,900', status: 'warning', tickets: 5, renewals: 1, overdue: 2 },
    { name: 'East Legon Residences', type: 'Residential', units: 32, occupancy: 94, revenue: 'GHS 51,600', status: 'healthy', tickets: 2, renewals: 4, overdue: 0 },
];

const statusColors = {
    healthy: { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
    attention: { bg: 'bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
    warning: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
};

export default function PropertyPortfolioVisual() {
    const [activeIdx, setActiveIdx] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIdx((prev) => (prev + 1) % properties.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const active = properties[activeIdx];
    const colors = statusColors[active.status as keyof typeof statusColors];

    return (
        <div className="dark bg-background border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono text-muted-foreground">Portfolio Overview</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">Illustrative</span>
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-3 gap-4 p-5 border-b border-border">
                {[
                    { label: 'Total Units', value: '94' },
                    { label: 'Avg Occupancy', value: '90%' },
                    { label: 'Monthly Revenue', value: 'GHS 195K' },
                ].map((stat) => (
                    <div key={stat.label} className="text-center">
                        <div className="text-lg font-bold text-foreground">{stat.value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Property List */}
            <div className="divide-y divide-border/50">
                {properties.map((prop, i) => {
                    const c = statusColors[prop.status as keyof typeof statusColors];
                    const isActive = i === activeIdx;
                    return (
                        <motion.div
                            key={prop.name}
                            animate={{ backgroundColor: isActive ? 'rgba(245,158,11,0.05)' : 'rgba(0,0,0,0)' }}
                            className="px-5 py-3 flex items-center gap-4 cursor-pointer"
                            onClick={() => setActiveIdx(i)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">{prop.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{prop.type}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-muted-foreground">{prop.units} units</span>
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            whileInView={{ width: `${prop.occupancy}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 1, delay: i * 0.15 }}
                                            className={`h-full rounded-full ${c.bar}`}
                                        />
                                    </div>
                                    <span className={`text-[10px] font-mono ${c.text}`}>{prop.occupancy}%</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-mono text-foreground">{prop.revenue}</div>
                                <div className="text-[10px] text-muted-foreground">/month</div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Detail Card */}
            <div className="px-5 py-4 border-t border-border">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeIdx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="grid grid-cols-4 gap-3"
                    >
                        {[
                            { label: 'Open Tickets', value: active.tickets, accent: false },
                            { label: 'Lease Renewals', value: active.renewals, accent: true },
                            { label: 'Overdue Rent', value: active.overdue, accent: false },
                            { label: 'Collections', value: `${active.occupancy}%`, accent: false },
                        ].map((item) => (
                            <div key={item.label} className="text-center">
                                <div className={`text-base font-bold ${item.accent ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>{item.value}</div>
                                <div className="text-[9px] text-muted-foreground uppercase">{item.label}</div>
                            </div>
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
