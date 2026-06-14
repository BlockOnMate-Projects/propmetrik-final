'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Task {
    name: string;
    progress: number;
    status: 'on-track' | 'at-risk' | 'behind' | 'complete';
    phase: string;
}

const TASKS: Task[] = [
    { name: 'Site Preparation', progress: 100, status: 'complete', phase: 'Foundation' },
    { name: 'Ground Floor Concrete', progress: 100, status: 'complete', phase: 'Foundation' },
    { name: 'Steel Framework', progress: 78, status: 'on-track', phase: 'Structure' },
    { name: 'Electrical Rough-In', progress: 45, status: 'on-track', phase: 'Structure' },
    { name: 'Exterior Cladding', progress: 32, status: 'at-risk', phase: 'Envelope' },
    { name: 'HVAC Installation', progress: 15, status: 'on-track', phase: 'MEP' },
    { name: 'Interior Finishing', progress: 0, status: 'behind', phase: 'Finishes' },
];

const STATUS_COLOR: Record<string, string> = {
    'on-track': 'bg-emerald-500',
    'at-risk': 'bg-amber-500',
    'behind': 'bg-red-500',
    'complete': 'bg-blue-500',
};

const STATUS_TEXT: Record<string, string> = {
    'on-track': 'text-emerald-600 dark:text-emerald-400',
    'at-risk': 'text-amber-600 dark:text-amber-400',
    'behind': 'text-red-600 dark:text-red-400',
    'complete': 'text-blue-600 dark:text-blue-400',
};

export default function ProjectDashboardVisual() {
    const [activeTask, setActiveTask] = useState(0);
    const [budgetSpent, setBudgetSpent] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveTask((prev) => (prev + 1) % TASKS.length);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const target = 62;
        let current = 0;
        const timer = setInterval(() => {
            current += 1;
            setBudgetSpent(Math.min(current, target));
            if (current >= target) clearInterval(timer);
        }, 40);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="dark relative w-full rounded-xl overflow-hidden bg-background border border-border p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Illustrative Dashboard</div>
                    <div className="text-lg font-bold text-foreground">Accra Heights — 24-Unit Residential</div>
                </div>
                <div className="flex gap-2">
                    {(['complete', 'on-track', 'at-risk', 'behind'] as const).map(s => (
                        <div key={s} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${STATUS_COLOR[s]}`} />
                            <span className="text-[10px] text-muted-foreground capitalize">{s.replace('-', ' ')}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Gantt-style rows */}
            <div className="space-y-2 mb-6">
                {TASKS.map((task, i) => (
                    <motion.div
                        key={task.name}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08 }}
                        className={`grid grid-cols-[180px_1fr_60px] items-center gap-3 py-1.5 px-3 rounded-md transition-colors ${
                            activeTask === i ? 'bg-card ring-1 ring-amber-500/30' : ''
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[task.status]}`} />
                            <span className={`text-xs font-mono truncate ${activeTask === i ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {task.name}
                            </span>
                        </div>

                        <div className="relative h-5 bg-muted rounded overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${task.progress}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1.2, delay: i * 0.1, ease: 'easeOut' }}
                                className={`absolute left-0 top-0 h-full rounded ${STATUS_COLOR[task.status]}/70`}
                                style={{ background: `linear-gradient(90deg, ${task.status === 'complete' ? '#3b82f6' : task.status === 'on-track' ? '#10b981' : task.status === 'at-risk' ? '#f59e0b' : '#ef4444'}88, ${task.status === 'complete' ? '#3b82f6' : task.status === 'on-track' ? '#10b981' : task.status === 'at-risk' ? '#f59e0b' : '#ef4444'}44)` }}
                            />
                            {/* Phase label */}
                            <div className="absolute inset-0 flex items-center px-2">
                                <span className="text-[9px] font-mono text-muted-foreground">{task.phase}</span>
                            </div>
                        </div>

                        <span className={`text-xs font-mono text-right ${STATUS_TEXT[task.status]}`}>
                            {task.progress}%
                        </span>
                    </motion.div>
                ))}
            </div>

            {/* Bottom KPIs */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Budget Used', value: `${budgetSpent}%`, sub: 'GHS 1.86M / 3M' },
                    { label: 'Timeline', value: '67%', sub: 'Month 8 of 12' },
                    { label: 'Open RFIs', value: '14', sub: '3 critical' },
                    { label: 'Safety Score', value: '97', sub: '0 incidents' },
                ].map((kpi, i) => (
                    <motion.div
                        key={kpi.label}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="bg-card border border-border rounded-lg p-3 text-center"
                    >
                        <div className="text-xl font-bold text-foreground font-mono">{kpi.value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</div>
                    </motion.div>
                ))}
            </div>

            {/* Animated pulse ring */}
            <motion.div
                className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-500"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
            />
        </div>
    );
}
