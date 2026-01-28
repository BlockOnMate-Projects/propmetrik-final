"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SignatureCaptureProps, SignatureData, SignatureFont } from '../types';
import { SIGNATURE_FONTS, loadSignatureFonts, generateTypedSignatureImage } from '../utils';

// Icons (inline SVG to avoid dependency on specific icon library)
const PenIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
    </svg>
);

const TypeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
);

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
);

const EraserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
);

const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"/>
    </svg>
);

type TabType = 'draw' | 'type' | 'upload';

interface ThemeClasses {
    overlay: string;
    modal: string;
    header: string;
    title: string;
    description: string;
    tabList: string;
    tabTrigger: string;
    tabTriggerActive: string;
    canvas: string;
    input: string;
    label: string;
    selectTrigger: string;
    selectContent: string;
    selectItem: string;
    preview: string;
    uploadZone: string;
    button: string;
    buttonPrimary: string;
    buttonGhost: string;
    disclaimer: string;
}

const darkTheme: ThemeClasses = {
    overlay: 'fixed inset-0 bg-black/80 z-50',
    modal: 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl max-w-lg w-full z-50 p-6',
    header: 'mb-4',
    title: 'text-white font-mono uppercase flex items-center gap-2 text-lg font-bold',
    description: 'text-zinc-500 font-mono text-xs mt-1',
    tabList: 'flex bg-zinc-900 border border-zinc-800 rounded-lg p-1',
    tabTrigger: 'flex-1 py-2 px-3 rounded-md text-zinc-400 font-mono text-xs flex items-center justify-center gap-1 transition-colors',
    tabTriggerActive: 'bg-amber-600 text-black font-bold',
    canvas: 'cursor-crosshair touch-none w-full',
    input: 'w-full px-3 py-2 bg-black border border-zinc-800 rounded-md text-white font-mono focus:border-amber-500 focus:outline-none',
    label: 'text-[10px] font-mono uppercase text-zinc-500',
    selectTrigger: 'w-full px-3 py-3 bg-black border border-zinc-800 rounded-md text-white flex items-center justify-between cursor-pointer hover:border-zinc-700',
    selectContent: 'absolute top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-800 rounded-md max-h-[300px] overflow-auto z-10',
    selectItem: 'px-3 py-3 hover:bg-zinc-900 cursor-pointer flex items-center justify-between',
    preview: 'border border-zinc-800 rounded-lg p-6 bg-white',
    uploadZone: 'border-2 border-dashed border-zinc-800 rounded-lg p-6 text-center hover:border-zinc-700 transition-colors cursor-pointer',
    button: 'px-4 py-2 rounded-md font-mono text-xs flex items-center gap-1 transition-colors',
    buttonPrimary: 'bg-amber-600 hover:bg-amber-500 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed',
    buttonGhost: 'text-zinc-500 hover:text-white hover:bg-zinc-900',
    disclaimer: 'text-[10px] text-zinc-600 text-center max-w-[400px] mx-auto mt-4',
};

const lightTheme: ThemeClasses = {
    overlay: 'fixed inset-0 bg-black/50 z-50',
    modal: 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-lg shadow-xl max-w-lg w-full z-50',
    header: 'p-6 pb-0',
    title: 'text-slate-900 flex items-center gap-2 text-xl font-bold',
    description: 'text-slate-500 text-sm mt-1',
    tabList: 'flex border-b border-slate-200 px-6',
    tabTrigger: 'py-3 px-4 text-slate-500 text-sm flex items-center justify-center gap-2 border-b-2 border-transparent transition-colors -mb-px',
    tabTriggerActive: 'text-blue-600 border-blue-600',
    canvas: 'cursor-crosshair touch-none w-full',
    input: 'w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-900 focus:border-blue-500 focus:outline-none',
    label: 'text-xs font-medium text-slate-500 uppercase tracking-wider',
    selectTrigger: 'w-full px-3 py-3 bg-white border border-slate-200 rounded-md text-slate-900 flex items-center justify-between cursor-pointer hover:border-slate-300',
    selectContent: 'absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-[300px] overflow-auto z-10',
    selectItem: 'px-3 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between',
    preview: 'border border-slate-200 rounded-lg p-6 bg-white shadow-inner',
    uploadZone: 'border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-slate-400 transition-colors cursor-pointer',
    button: 'px-4 py-2 rounded-md text-sm flex items-center gap-2 transition-colors',
    buttonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed',
    buttonGhost: 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
    disclaimer: 'text-[10px] text-slate-400 text-center max-w-[400px] mx-auto p-6 pt-4',
};

/**
 * SignatureCapture Component
 * 
 * A DocuSign-style signature capture modal with support for:
 * - Draw: Freehand drawing on canvas with touch support
 * - Type: Select from 10 signature fonts
 * - Upload: Upload an existing signature image
 * 
 * Supports both dark and light themes for different contexts.
 */
export function SignatureCapture({
    isOpen,
    onClose,
    onCapture,
    isInitials = false,
    signerName = '',
    theme = 'light',
}: SignatureCaptureProps) {
    const [activeTab, setActiveTab] = useState<TabType>('draw');
    const [typedText, setTypedText] = useState(signerName);
    const [selectedFontId, setSelectedFontId] = useState('dancing');
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [fontSelectOpen, setFontSelectOpen] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const classes = theme === 'dark' ? darkTheme : lightTheme;

    const selectedFont = SIGNATURE_FONTS.find(f => f.id === selectedFontId) || SIGNATURE_FONTS[0];

    // Load Google Fonts when modal opens
    useEffect(() => {
        if (isOpen) {
            loadSignatureFonts();
            setTypedText(signerName || '');
        }
    }, [isOpen, signerName]);

    // Initialize canvas
    useEffect(() => {
        if (isOpen && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }, [isOpen, activeTab]);

    // Canvas drawing handlers
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

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
        setHasDrawn(false);
    }, []);

    // File upload handler
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            setUploadedImage(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    // Confirm handler
    const handleConfirm = useCallback(() => {
        let signatureData: SignatureData | null = null;
        
        switch (activeTab) {
            case 'draw':
                if (!canvasRef.current || !hasDrawn) return;
                signatureData = {
                    type: 'drawn',
                    data: canvasRef.current.toDataURL('image/png'),
                };
                break;
            case 'type':
                if (!typedText.trim()) return;
                signatureData = {
                    type: 'typed',
                    data: generateTypedSignatureImage(typedText, selectedFont.name),
                    fontFamily: selectedFont.name,
                };
                break;
            case 'upload':
                if (!uploadedImage) return;
                signatureData = {
                    type: 'uploaded',
                    data: uploadedImage,
                };
                break;
        }
        
        if (signatureData) {
            onCapture(signatureData);
            onClose();
        }
    }, [activeTab, hasDrawn, typedText, selectedFont, uploadedImage, onCapture, onClose]);

    const canConfirm = (): boolean => {
        switch (activeTab) {
            case 'draw': return hasDrawn;
            case 'type': return typedText.trim().length > 0;
            case 'upload': return !!uploadedImage;
            default: return false;
        }
    };

    if (!isOpen) return null;

    const label = isInitials ? 'initials' : 'signature';

    return (
        <>
            {/* Overlay */}
            <div className={classes.overlay} onClick={onClose} />
            
            {/* Modal */}
            <div className={classes.modal}>
                {/* Header */}
                <div className={classes.header}>
                    <h2 className={classes.title}>
                        <span className={theme === 'dark' ? 'text-amber-500' : 'text-blue-600'}>
                            <PenIcon />
                        </span>
                        {isInitials ? 'Add Your Initials' : 'Add Your Signature'}
                    </h2>
                    <p className={classes.description}>
                        Draw, type, or upload your {label}
                    </p>
                </div>

                {/* Tabs */}
                <div className={classes.tabList}>
                    {(['draw', 'type', 'upload'] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            className={`${classes.tabTrigger} ${activeTab === tab ? classes.tabTriggerActive : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'draw' && <PenIcon />}
                            {tab === 'type' && <TypeIcon />}
                            {tab === 'upload' && <UploadIcon />}
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-6 space-y-4">
                    {/* Draw Tab */}
                    {activeTab === 'draw' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className={classes.label}>
                                    Draw your {label} below
                                </label>
                                <button
                                    className={`${classes.button} ${classes.buttonGhost}`}
                                    onClick={clearCanvas}
                                >
                                    <EraserIcon /> Clear
                                </button>
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <canvas
                                    ref={canvasRef}
                                    width={450}
                                    height={120}
                                    className={classes.canvas}
                                    style={{ height: '120px' }}
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                />
                            </div>
                            <p className={`${classes.label} text-center`}>
                                Use your mouse or finger to draw
                            </p>
                        </div>
                    )}

                    {/* Type Tab */}
                    {activeTab === 'type' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className={classes.label}>
                                    Type your {isInitials ? 'initials' : 'full name'}
                                </label>
                                <input
                                    type="text"
                                    value={typedText}
                                    onChange={(e) => setTypedText(e.target.value)}
                                    placeholder={isInitials ? 'e.g. JD' : 'e.g. John Doe'}
                                    className={classes.input}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className={classes.label}>
                                    Select signature style
                                </label>
                                <div className="relative">
                                    <button
                                        className={classes.selectTrigger}
                                        onClick={() => setFontSelectOpen(!fontSelectOpen)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span 
                                                className="text-xl"
                                                style={{ fontFamily: `"${selectedFont.name}", ${selectedFont.fallback}` }}
                                            >
                                                {typedText || (isInitials ? 'JD' : 'Your Name')}
                                            </span>
                                            <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'}`}>
                                                {selectedFont.preview}
                                            </span>
                                        </div>
                                        <ChevronDownIcon />
                                    </button>
                                    
                                    {fontSelectOpen && (
                                        <div className={classes.selectContent}>
                                            {SIGNATURE_FONTS.map((font) => (
                                                <div
                                                    key={font.id}
                                                    className={classes.selectItem}
                                                    onClick={() => {
                                                        setSelectedFontId(font.id);
                                                        setFontSelectOpen(false);
                                                    }}
                                                >
                                                    <span 
                                                        className="text-xl"
                                                        style={{ fontFamily: `"${font.name}", ${font.fallback}` }}
                                                    >
                                                        {typedText || (isInitials ? 'JD' : 'Your Name')}
                                                    </span>
                                                    <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'}`}>
                                                        {font.preview}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Preview */}
                            <div className={classes.preview}>
                                <p 
                                    className="text-4xl text-center text-black"
                                    style={{ fontFamily: `"${selectedFont.name}", ${selectedFont.fallback}` }}
                                >
                                    {typedText || (isInitials ? 'JD' : 'Your Name')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Upload Tab */}
                    {activeTab === 'upload' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className={classes.label}>
                                    Upload an image of your {label}
                                </label>
                                <div className={classes.uploadZone}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        id="signature-upload"
                                    />
                                    <label htmlFor="signature-upload" className="cursor-pointer">
                                        <div className={`h-8 w-8 mx-auto mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-slate-400'}`}>
                                            <UploadIcon />
                                        </div>
                                        <p className={`text-sm ${theme === 'dark' ? 'text-zinc-500' : 'text-slate-500'}`}>
                                            Click to upload or drag and drop
                                        </p>
                                        <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-zinc-600' : 'text-slate-400'}`}>
                                            PNG, JPG up to 2MB
                                        </p>
                                    </label>
                                </div>
                            </div>
                            {uploadedImage && (
                                <div className={classes.preview}>
                                    <img 
                                        src={uploadedImage} 
                                        alt="Uploaded signature" 
                                        className="max-h-24 mx-auto object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Disclaimer */}
                <p className={classes.disclaimer}>
                    By clicking Adopt and Sign, I agree that the signature will be the electronic 
                    representation of my signature for all purposes when I use it on documents, 
                    including legally binding contracts — just the same as a pen-and-paper signature.
                </p>

                {/* Footer */}
                <div className="flex justify-between items-center p-6 pt-4">
                    <button
                        className={`${classes.button} ${classes.buttonGhost}`}
                        onClick={onClose}
                    >
                        <XIcon /> Cancel
                    </button>
                    <button
                        className={`${classes.button} ${classes.buttonPrimary}`}
                        onClick={handleConfirm}
                        disabled={!canConfirm()}
                    >
                        <CheckIcon /> Adopt {isInitials ? 'Initials' : 'Signature'}
                    </button>
                </div>
            </div>
        </>
    );
}
