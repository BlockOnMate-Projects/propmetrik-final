'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, Minus, Maximize2, Move, Square, ExternalLink } from 'lucide-react';
import { useWindowManagerStore } from '@/store/windowManagerStore';

interface InsightWindowProps {
    id: string;
    title: string;
    children: React.ReactNode;
    isMinimized?: boolean;
    zIndex: number;
    initialPosition?: { x: number; y: number };
    initialSize?: { width: number; height: number };
}

export function InsightWindow({
    id,
    title,
    children,
    isMinimized,
    zIndex,
    initialPosition,
    initialSize,
}: InsightWindowProps) {
    const { closeWindow, toggleMinimize, focusWindow, updatePosition, updateSize } = useWindowManagerStore();
    const constraintsRef = useRef(null);
    const controls = useDragControls();

    // Track accumulated position so drag doesn't jump
    const [pos, setPos] = useState(initialPosition || { x: 100, y: 100 });

    // Internal state for resizing
    const [size, setSize] = useState(initialSize || { width: 480, height: 600 });
    const isResizing = useRef(false);

    const handleResize = (e: React.MouseEvent, direction: 'se') => {
        e.preventDefault();
        isResizing.current = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = size.width;
        const startHeight = size.height;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.min(520, Math.max(320, startWidth + (moveEvent.clientX - startX)));
            const newHeight = Math.min(700, Math.max(200, startHeight + (moveEvent.clientY - startY)));
            setSize({ width: newWidth, height: newHeight });
        };

        const onMouseUp = () => {
            isResizing.current = false;
            updateSize(id, size.width, size.height);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    if (isMinimized) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            drag
            dragControls={controls}
            dragListener={false}
            dragMomentum={false}
            onDragEnd={(_, info) => {
                const newX = pos.x + info.offset.x;
                const newY = pos.y + info.offset.y;
                setPos({ x: newX, y: newY });
                updatePosition(id, newX, newY);
            }}
            onPointerDown={() => focusWindow(id)}
            style={{
                zIndex,
                width: Math.min(size.width, window.innerWidth - 40),
                height: Math.min(size.height, window.innerHeight - 40),
                maxWidth: 520,
                maxHeight: 700,
                position: 'fixed',
                top: pos.y,
                left: pos.x,
            }}
            className={cn(
                'flex flex-col bg-background border border-border shadow-2xl rounded-xl overflow-hidden',
                'ring-1 ring-white/5 backdrop-blur-xl'
            )}
        >
            {/* Title Bar */}
            <div
                onPointerDown={(e) => controls.start(e)}
                className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-card/80 border-b border-border cursor-move"
            >
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                    <span className="text-xs font-mono font-bold text-zinc-200 tracking-wide truncate max-w-[200px]">
                        {title}
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleMinimize(id); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors"
                    >
                        <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); /* Fullscreen logic if needed */ }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); closeWindow(id); }}
                        className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors ml-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto min-h-0 relative bg-background/50">
                {children}
            </div>

            {/* Resize Handle (Bottom Right) */}
            <div
                onMouseDown={(e) => handleResize(e, 'se')}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center group"
            >
                <div className="w-1.5 h-1.5 border-r border-b border-border group-hover:border-amber-500 transition-colors" />
            </div>
        </motion.div>
    );
}
