'use client';

import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerStore } from '@/store/windowManagerStore';
import { InsightWindow } from './InsightWindow';
import { WorkspaceContent } from '@/components/workspace/WorkspaceContent';
import { AnimatePresence } from 'framer-motion';

export function FloatingWindowManager() {
    const { windows } = useWindowManagerStore();

    // Ensure we only render on the client
    const [mounted, setMounted] = React.useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[100]">
            <AnimatePresence>
                {windows.map((win) => {
                    if (!win.isOpen) return null;

                    return (
                        <div key={win.id} className="pointer-events-auto">
                            <InsightWindow
                                id={win.id}
                                title={win.title}
                                zIndex={win.zIndex}
                                isMinimized={win.isMinimized}
                                initialPosition={win.position}
                                initialSize={win.size}
                            >
                                {win.type === 'workspace' && win.data && (
                                    <WorkspaceContent
                                        {...win.data}
                                        onClose={() => { }} // Store handles closing
                                    />
                                )}
                                {win.type === 'insight' && (
                                    <div className="p-4 text-zinc-400 font-mono text-xs">
                                        {/* Chart content will be injected here via win.data */}
                                        <div className="flex items-center justify-center h-full border border-dashed border-zinc-800 rounded-lg">
                                            {win.data?.content || 'Analytical Insight Loading...'}
                                        </div>
                                    </div>
                                )}
                            </InsightWindow>
                        </div>
                    );
                })}
            </AnimatePresence>
        </div>,
        document.body
    );
}
