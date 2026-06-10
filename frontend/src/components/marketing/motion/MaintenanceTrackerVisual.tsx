'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const requests = [
    { id: 'MR-301', tenant: 'Kwame A.', unit: '4B', issue: 'AC not cooling', priority: 'high', age: '2h', status: 'assigned' },
    { id: 'MR-298', tenant: 'Abena M.', unit: '12A', issue: 'Leaking faucet', priority: 'medium', age: '1d', status: 'in-progress' },
    { id: 'MR-295', tenant: 'Yaw K.', unit: '7C', issue: 'Broken lock', priority: 'high', age: '3h', status: 'assigned' },
    { id: 'MR-290', tenant: 'Esi D.', unit: '2A', issue: 'Paint peeling', priority: 'low', age: '5d', status: 'scheduled' },
    { id: 'MR-288', tenant: 'Kojo P.', unit: '9B', issue: 'Power outage', priority: 'urgent', age: '30m', status: 'dispatched' },
];

const priorityColors: Record<string, { dot: string; text: string }> = {
    urgent: { dot: 'bg-red-500', text: 'text-red-400' },
    high: { dot: 'bg-amber-500', text: 'text-amber-400' },
    medium: { dot: 'bg-blue-500', text: 'text-blue-400' },
    low: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
    assigned: { label: 'Assigned', color: 'text-amber-400 bg-amber-500/10' },
    'in-progress': { label: 'In Progress', color: 'text-blue-400 bg-blue-500/10' },
    scheduled: { label: 'Scheduled', color: 'text-zinc-400 bg-zinc-500/10' },
    dispatched: { label: 'Dispatched', color: 'text-emerald-400 bg-emerald-500/10' },
};

export default function MaintenanceTrackerVisual() {
    const [highlightIdx, setHighlightIdx] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setHighlightIdx((prev) => (prev + 1) % requests.length);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-mono text-zinc-400">Maintenance Queue</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600">
                    <span className="text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">Illustrative</span>
                    <span className="text-red-400">2 urgent</span>
                    <span>{requests.length} open</span>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-zinc-800">
                {[
                    { label: 'Avg Response', value: '2.4h' },
                    { label: 'Resolved Today', value: '7' },
                    { label: 'Vendor Jobs', value: '3' },
                    { label: 'Satisfaction', value: '4.6★' },
                ].map((s) => (
                    <div key={s.label} className="text-center">
                        <div className="text-sm font-bold text-white">{s.value}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Requests */}
            <div className="divide-y divide-zinc-800/50">
                {requests.map((req, i) => {
                    const pc = priorityColors[req.priority];
                    const sc = statusLabels[req.status];
                    return (
                        <motion.div
                            key={req.id}
                            animate={{ backgroundColor: i === highlightIdx ? 'rgba(245,158,11,0.04)' : 'rgba(0,0,0,0)' }}
                            className="px-5 py-3"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                                    <span className="text-xs font-mono text-zinc-500">{req.id}</span>
                                    <span className="text-sm font-medium text-white">{req.issue}</span>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${sc.color}`}>
                                    {sc.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-zinc-500 pl-4">
                                <span>{req.tenant} · Unit {req.unit}</span>
                                <span className={pc.text}>{req.priority}</span>
                                <span>{req.age} ago</span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Activity Feed */}
            <div className="px-5 py-3 border-t border-zinc-800">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={highlightIdx}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="text-[11px] text-zinc-500 font-mono"
                    >
                        <span className="text-amber-400">▸</span>{' '}
                        Vendor dispatched to Unit {requests[highlightIdx].unit} for &quot;{requests[highlightIdx].issue}&quot;
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
