'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function DashboardDemo() {
    const [activeTab, setActiveTab] = useState(0);
    const tabs = ['Analytics', 'Valuations', 'Market Data'];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveTab((prev) => (prev + 1) % tabs.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [tabs.length]);

    return (
        <div className="dark relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
            {/* Dashboard Header */}
            <div className="bg-background border-b border-border p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-yellow-400" />
                        <div>
                            <div className="text-sm font-bold text-foreground">PROPMETRIK</div>
                            <div className="text-xs text-muted-foreground">Illustrative dashboard</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-zinc-700" />
                        ))}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mt-4">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(index)}
                            className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === index
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-muted-foreground'
                                }`}
                        >
                            {tab}
                            {activeTab === index && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-4">
                    {/* Stat Cards */}
                    {[
                        { label: 'Total Value', value: 'GHS 2.5B', change: '+12%' },
                        { label: 'Properties', value: '5,234', change: '+8%' },
                        { label: 'Accuracy', value: '94.8%', change: '+2%' },
                    ].map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-background border border-border rounded-lg p-4"
                        >
                            <div className="text-xs text-muted-foreground mb-2">{stat.label}</div>
                            <div className="flex items-end justify-between">
                                <div className="text-xl font-bold text-foreground">{stat.value}</div>
                                <div className="text-xs text-green-600 dark:text-green-400">{stat.change}</div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Chart Area */}
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="bg-background border border-border rounded-lg p-4 h-40"
                >
                    <div className="flex items-end justify-between h-full gap-2">
                        {Array.from({ length: 12 }, (_, i) => {
                            const height = 30 + Math.random() * 70;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${height}%` }}
                                    transition={{ delay: i * 0.1, duration: 0.5 }}
                                    className="flex-1 bg-gradient-to-t from-primary to-yellow-400 rounded-t"
                                />
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
