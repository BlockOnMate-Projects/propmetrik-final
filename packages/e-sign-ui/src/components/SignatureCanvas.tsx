"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import type { SignatureCanvasProps } from '../types';

export interface SignatureCanvasHandle {
    toDataURL: () => string | null;
    clear: () => void;
    isEmpty: () => boolean;
}

/**
 * SignatureCanvas Component
 * 
 * A reusable canvas component for capturing hand-drawn signatures.
 * Supports both mouse and touch input.
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
    function SignatureCanvas(
        {
            width = 600,
            height = 200,
            className = '',
            strokeColor = 'black',
            strokeWidth = 2,
        },
        ref
    ) {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const [isDrawing, setIsDrawing] = useState(false);
        const [hasDrawn, setHasDrawn] = useState(false);

        // Initialize canvas
        useEffect(() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx && canvas) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }, [strokeColor, strokeWidth]);

        // Get coordinates from mouse or touch event
        const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0 };
            
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            if ('touches' in e) {
                const touch = e.touches[0];
                return {
                    x: (touch.clientX - rect.left) * scaleX,
                    y: (touch.clientY - rect.top) * scaleY
                };
            }
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }, []);

        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            e.preventDefault();
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;
            
            const { x, y } = getCoords(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
            setHasDrawn(true);
        }, [getCoords]);

        const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing) return;
            e.preventDefault();
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;
            
            const { x, y } = getCoords(e);
            ctx.lineTo(x, y);
            ctx.stroke();
        }, [isDrawing, getCoords]);

        const stopDrawing = useCallback(() => {
            setIsDrawing(false);
        }, []);

        const clear = useCallback(() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx || !canvas) return;
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            setHasDrawn(false);
        }, [strokeColor, strokeWidth]);

        // Expose methods to parent
        useImperativeHandle(ref, () => ({
            toDataURL: () => {
                if (!canvasRef.current || !hasDrawn) return null;
                return canvasRef.current.toDataURL('image/png');
            },
            clear,
            isEmpty: () => !hasDrawn,
        }), [hasDrawn, clear]);

        return (
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className={`touch-none ${className}`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />
        );
    }
);
