"use client";

import React, { useState, useRef, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, PenTool, Type, Check } from "lucide-react";
import SignatureCanvas, { SignatureCanvasHandle } from "./SignatureCanvas";

interface SignatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (signatureDataUrl: string) => void;
    signerName: string;
}

export default function SignatureModal({
    isOpen,
    onClose,
    onConfirm,
    signerName,
}: SignatureModalProps) {
    const [activeTab, setActiveTab] = useState("draw");
    const [typedName, setTypedName] = useState(signerName);
    const canvasRef = useRef<SignatureCanvasHandle>(null);
    const typePreviewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTypedName(signerName);
        }
    }, [isOpen, signerName]);

    const handleClear = () => {
        canvasRef.current?.clear();
    };

    const generateTypedSignature = (): string | null => {
        if (!typePreviewRef.current) return null;

        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 200;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = "italic 48px 'Brush Script MT', 'Dancing Script', cursive";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL("image/png");
    };

    const handleAdopt = () => {
        let signatureDataUrl: string | null = null;

        if (activeTab === "draw") {
            signatureDataUrl = canvasRef.current?.toDataURL() || null;
            if (!signatureDataUrl) {
                alert("Please draw your signature first.");
                return;
            }
        } else {
            if (!typedName.trim()) {
                alert("Please type your name.");
                return;
            }
            signatureDataUrl = generateTypedSignature();
        }

        if (signatureDataUrl) {
            onConfirm(signatureDataUrl);
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] bg-white p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <PenTool className="h-5 w-5 text-primary" />
                        Adopt Your Signature
                    </DialogTitle>
                </DialogHeader>

                <Tabs
                    defaultValue="draw"
                    className="w-full"
                    onValueChange={setActiveTab}
                >
                    <div className="px-6 border-b">
                        <TabsList className="bg-transparent h-auto p-0 gap-6">
                            <TabsTrigger
                                value="draw"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 flex items-center gap-2"
                            >
                                <PenTool className="h-4 w-4" />
                                Draw
                            </TabsTrigger>
                            <TabsTrigger
                                value="type"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 flex items-center gap-2"
                            >
                                <Type className="h-4 w-4" />
                                Type
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6 h-[250px] bg-slate-50">
                        <TabsContent value="draw" className="m-0 h-full relative">
                            <SignatureCanvas
                                ref={canvasRef}
                                className="h-full w-full bg-white shadow-inner"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                                onClick={handleClear}
                            >
                                <RotateCcw className="h-3 w-3 mr-1" /> Clear
                            </Button>
                        </TabsContent>

                        <TabsContent value="type" className="m-0 h-full space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Full Name
                                </label>
                                <Input
                                    value={typedName}
                                    onChange={(e) => setTypedName(e.target.value)}
                                    placeholder="Type your name here..."
                                    className="bg-white border-slate-200"
                                />
                            </div>

                            <div
                                ref={typePreviewRef}
                                className="h-28 w-full bg-white border border-slate-200 rounded-md shadow-inner flex items-center justify-center p-4 overflow-hidden"
                            >
                                <span
                                    className="text-4xl text-black select-none pointer-events-none"
                                    style={{
                                        fontFamily: "var(--font-dancing-script), 'Brush Script MT', cursive",
                                        fontStyle: 'italic'
                                    }}
                                >
                                    {typedName || "Your Signature"}
                                </span>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="p-6 flex flex-col items-center justify-center space-y-4">
                    <p className="text-[10px] text-slate-400 text-center max-w-[400px]">
                        By clicking Adopt and Sign, I agree that the signature and initials will be the electronic representation of my signature and initials for all purposes when I (or my agent) use them on documents, including legally binding contracts - just the same as a pen-and-paper signature or initial.
                    </p>
                </div>

                <DialogFooter className="p-6 pt-0 flex sm:justify-between items-center bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleAdopt} className="gap-2">
                        <Check className="h-4 w-4" />
                        Adopt and Sign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
