'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Pen, 
    Type, 
    Eraser, 
    RotateCcw, 
    Check, 
    X,
    Upload,
    ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { SignatureData } from './types';

interface SignatureCaptureProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (signature: SignatureData) => void;
    signerName?: string;
    isInitials?: boolean;
}

// DocuSign-style signature fonts - using Google Fonts
const SIGNATURE_FONTS = [
    { id: 'dancing-script', name: 'Dancing Script', googleFont: 'Dancing+Script', fallback: 'cursive', preview: 'Elegant Script' },
    { id: 'great-vibes', name: 'Great Vibes', googleFont: 'Great+Vibes', fallback: 'cursive', preview: 'Formal Calligraphy' },
    { id: 'satisfy', name: 'Satisfy', googleFont: 'Satisfy', fallback: 'cursive', preview: 'Casual Handwriting' },
    { id: 'pacifico', name: 'Pacifico', googleFont: 'Pacifico', fallback: 'cursive', preview: 'Retro Script' },
    { id: 'alex-brush', name: 'Alex Brush', googleFont: 'Alex+Brush', fallback: 'cursive', preview: 'Brush Script' },
    { id: 'allura', name: 'Allura', googleFont: 'Allura', fallback: 'cursive', preview: 'Classic Signature' },
    { id: 'sacramento', name: 'Sacramento', googleFont: 'Sacramento', fallback: 'cursive', preview: 'Flowing Script' },
    { id: 'pinyon-script', name: 'Pinyon Script', googleFont: 'Pinyon+Script', fallback: 'cursive', preview: 'Copperplate Style' },
    { id: 'mr-de-haviland', name: 'Mr De Haviland', googleFont: 'Mr+De+Haviland', fallback: 'cursive', preview: 'Executive Signature' },
    { id: 'nothing-you-could-do', name: 'Nothing You Could Do', googleFont: 'Nothing+You+Could+Do', fallback: 'cursive', preview: 'Quick Scrawl' },
];

export function SignatureCapture({ 
    isOpen, 
    onClose, 
    onCapture, 
    signerName = '',
    isInitials = false 
}: SignatureCaptureProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [typedText, setTypedText] = useState(signerName);
    const [selectedFontId, setSelectedFontId] = useState(SIGNATURE_FONTS[0].id);
    const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [fontsLoaded, setFontsLoaded] = useState(false);

    // Get the selected font object
    const selectedFont = SIGNATURE_FONTS.find(f => f.id === selectedFontId) || SIGNATURE_FONTS[0];

    // Load Google Fonts dynamically
    useEffect(() => {
        if (isOpen && !fontsLoaded) {
            const fontFamilies = SIGNATURE_FONTS.map(f => f.googleFont).join('&family=');
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${fontFamilies}&display=swap`;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            
            // Wait for fonts to load
            link.onload = () => {
                setTimeout(() => setFontsLoaded(true), 100);
            };
            
            return () => {
                // Cleanup if needed
            };
        }
    }, [isOpen, fontsLoaded]);

    // Initialize canvas
    useEffect(() => {
        if (isOpen && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }, [isOpen]);

    // Drawing handlers
    const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        setIsDrawing(true);
        setHasDrawn(true);

        const rect = canvas.getBoundingClientRect();
        const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
    }, []);

    const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    }, [isDrawing]);

    const stopDrawing = useCallback(() => {
        setIsDrawing(false);
    }, []);

    // Clear canvas
    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    // Handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setUploadedImage(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    // Generate typed signature as image
    const generateTypedSignature = (): string => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#000000';
        ctx.font = `48px "${selectedFont.name}", ${selectedFont.fallback}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL('image/png');
    };

    // Confirm signature
    const handleConfirm = () => {
        let signatureData: SignatureData;

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
                    data: generateTypedSignature(),
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
            default:
                return;
        }

        onCapture(signatureData);
        onClose();
    };

    // Check if can confirm
    const canConfirm = () => {
        switch (activeTab) {
            case 'draw':
                return hasDrawn;
            case 'type':
                return typedText.trim().length > 0;
            case 'upload':
                return !!uploadedImage;
            default:
                return false;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                        <Pen className="h-4 w-4 text-amber-500" />
                        {isInitials ? 'Add Your Initials' : 'Add Your Signature'}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 font-mono text-xs">
                        Draw, type, or upload your {isInitials ? 'initials' : 'signature'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
                    <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
                        <TabsTrigger 
                            value="draw" 
                            className="flex-1 data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs"
                        >
                            <Pen className="h-3 w-3 mr-1" />
                            Draw
                        </TabsTrigger>
                        <TabsTrigger 
                            value="type" 
                            className="flex-1 data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs"
                        >
                            <Type className="h-3 w-3 mr-1" />
                            Type
                        </TabsTrigger>
                        <TabsTrigger 
                            value="upload" 
                            className="flex-1 data-[state=active]:bg-amber-600 data-[state=active]:text-black text-zinc-400 font-mono text-xs"
                        >
                            <Upload className="h-3 w-3 mr-1" />
                            Upload
                        </TabsTrigger>
                    </TabsList>

                    {/* Draw Tab */}
                    <TabsContent value="draw" className="mt-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Draw your {isInitials ? 'initials' : 'signature'} below
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearCanvas}
                                    className="text-zinc-500 hover:text-white h-6 px-2"
                                >
                                    <Eraser className="h-3 w-3 mr-1" />
                                    Clear
                                </Button>
                            </div>
                            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-white">
                                <canvas
                                    ref={canvasRef}
                                    width={450}
                                    height={120}
                                    className="cursor-crosshair touch-none"
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                />
                            </div>
                            <p className="text-[10px] font-mono text-zinc-600 text-center">
                                Use your mouse or finger to draw
                            </p>
                        </div>
                    </TabsContent>

                    {/* Type Tab */}
                    <TabsContent value="type" className="mt-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Type your {isInitials ? 'initials' : 'full name'}
                                </Label>
                                <Input
                                    value={typedText}
                                    onChange={(e) => setTypedText(e.target.value)}
                                    placeholder={isInitials ? 'e.g. JD' : 'e.g. John Doe'}
                                    className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Select signature style
                                </Label>
                                <Select value={selectedFontId} onValueChange={setSelectedFontId}>
                                    <SelectTrigger className="bg-black border-zinc-800 text-white h-14">
                                        <SelectValue>
                                            <div className="flex items-center gap-3">
                                                <span 
                                                    className="text-xl"
                                                    style={{ fontFamily: `"${selectedFont.name}", ${selectedFont.fallback}` }}
                                                >
                                                    {typedText || (isInitials ? 'JD' : 'Your Name')}
                                                </span>
                                                <span className="text-[10px] text-zinc-500 font-mono">
                                                    {selectedFont.preview}
                                                </span>
                                            </div>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800 max-h-[300px]">
                                        {SIGNATURE_FONTS.map((font) => (
                                            <SelectItem 
                                                key={font.id} 
                                                value={font.id}
                                                className="hover:bg-zinc-900 focus:bg-zinc-900 cursor-pointer py-3"
                                            >
                                                <div className="flex items-center justify-between w-full gap-4">
                                                    <span 
                                                        className="text-xl text-white"
                                                        style={{ fontFamily: `"${font.name}", ${font.fallback}` }}
                                                    >
                                                        {typedText || (isInitials ? 'JD' : 'Your Name')}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                                                        {font.preview}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Preview */}
                            <div className="border border-zinc-800 rounded-lg p-6 bg-white">
                                <p 
                                    className="text-4xl text-center text-black"
                                    style={{ fontFamily: `"${selectedFont.name}", ${selectedFont.fallback}` }}
                                >
                                    {typedText || (isInitials ? 'JD' : 'Your Name')}
                                </p>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Upload Tab */}
                    <TabsContent value="upload" className="mt-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Upload an image of your {isInitials ? 'initials' : 'signature'}
                                </Label>
                                <div className="border-2 border-dashed border-zinc-800 rounded-lg p-6 text-center hover:border-zinc-700 transition-colors">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        id="signature-upload"
                                    />
                                    <label htmlFor="signature-upload" className="cursor-pointer">
                                        <Upload className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                                        <p className="text-sm font-mono text-zinc-500">
                                            Click to upload or drag and drop
                                        </p>
                                        <p className="text-[10px] font-mono text-zinc-600 mt-1">
                                            PNG, JPG up to 2MB
                                        </p>
                                    </label>
                                </div>
                            </div>
                            {uploadedImage && (
                                <div className="border border-zinc-800 rounded-lg p-4 bg-white">
                                    <img 
                                        src={uploadedImage} 
                                        alt="Uploaded signature" 
                                        className="max-h-24 mx-auto object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-6">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="border-zinc-800 text-zinc-400 font-mono text-xs"
                    >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!canConfirm()}
                        className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs disabled:opacity-50"
                    >
                        <Check className="h-3 w-3 mr-1" />
                        Adopt {isInitials ? 'Initials' : 'Signature'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
