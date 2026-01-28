'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
    FileText, 
    Send, 
    Save,
    ArrowLeft,
    Users,
    Settings,
    CheckCircle,
    Loader2,
    AlertCircle,
    Plus,
    Trash2,
    Eye,
    Download,
    Pen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    SelectValue
} from '@/components/ui/select';
import { PDFViewer } from './PDFViewer';
import { SignatureCapture } from './SignatureCapture';
import { 
    SignatureField, 
    Signer, 
    SignerRole,
    SIGNER_COLORS,
    SIGNER_LABELS,
    ESignEnvelope,
    SignatureData
} from './types';
import { format } from 'date-fns';

interface ESignEditorProps {
    // Document source - either URL or HTML content to convert
    documentUrl?: string;
    documentHtml?: string;
    documentName: string;
    
    // Context for the signing request
    context: {
        type: 'lease' | 'valuation' | 'deal' | 'other';
        entityId: string;
        entityName: string;
    };
    
    // Pre-configured signers (optional)
    defaultSigners?: Partial<Signer>[];
    
    // Pre-configured fields (optional)
    defaultFields?: Partial<SignatureField>[];
    
    // Callbacks
    onSave?: (envelope: Partial<ESignEnvelope>) => void;
    onSend?: (envelope: Partial<ESignEnvelope>) => void;
    onCancel?: () => void;
}

export function ESignEditor({
    documentUrl,
    documentHtml,
    documentName,
    context,
    defaultSigners = [],
    defaultFields = [],
    onSave,
    onSend,
    onCancel
}: ESignEditorProps) {
    const router = useRouter();
    
    // State
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [activeTab, setActiveTab] = useState<'prepare' | 'signers' | 'settings'>('signers');
    const [pages, setPages] = useState<{ pageNumber: number; imageUrl: string }[]>([]);
    const [documentImage, setDocumentImage] = useState<string | null>(null);  // Full document image
    const [captureWidth, setCaptureWidth] = useState<number>(1224);           // Default: 816 * 1.5
    const [captureHeight, setCaptureHeight] = useState<number | null>(null);  // Will be set on capture
    const [signers, setSigners] = useState<Signer[]>([]);
    const [fields, setFields] = useState<SignatureField[]>([]);
    const [selectedSignerId, setSelectedSignerId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [expirationDays, setExpirationDays] = useState(7);
    
    // Signature capture
    const [captureModalOpen, setCaptureModalOpen] = useState(false);
    const [captureField, setCaptureField] = useState<SignatureField | null>(null);
    
    // Send confirmation
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    // Get selected signer
    const selectedSigner = signers.find(s => s.id === selectedSignerId) || null;

    // Initialize signers from defaults
    useEffect(() => {
        if (defaultSigners.length > 0) {
            const initialSigners: Signer[] = defaultSigners.map((s, i) => ({
                id: s.id || `signer-${i + 1}`,
                role: s.role || (`signer_${i + 1}` as SignerRole),
                name: s.name || '',
                email: s.email || '',
                phone: s.phone,
                color: SIGNER_COLORS[s.role || (`signer_${i + 1}` as SignerRole)],
                order: s.order || i + 1,
                status: 'pending',
            }));
            setSigners(initialSigners);
            if (initialSigners.length > 0) {
                setSelectedSignerId(initialSigners[0].id);
            }
            
            // Don't auto-create fields - user will drag them from the sidebar
            // This follows DocuSign pattern where user places fields manually
        }
    }, [defaultSigners]);

    // Convert HTML to PDF pages using html2canvas
    useEffect(() => {
        const loadDocument = async () => {
            setIsLoading(true);
            
            try {
                if (documentHtml) {
                    // Dynamically import html2canvas
                    const html2canvas = (await import('html2canvas')).default;
                    
                    // Create hidden iframe to render the HTML
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.left = '-9999px';
                    iframe.style.width = '816px';
                    iframe.style.height = '1056px';
                    iframe.style.border = 'none';
                    document.body.appendChild(iframe);

                    const doc = iframe.contentDocument;
                    if (doc) {
                        doc.open();
                        doc.write(documentHtml);
                        doc.close();

                        // Wait for content to load
                        await new Promise(resolve => setTimeout(resolve, 800));

                        // Get actual content height
                        const contentHeight = doc.body.scrollHeight;
                        const contentWidth = 816;
                        
                        // Resize iframe to fit all content
                        iframe.style.height = `${contentHeight}px`;

                        // Capture the entire content at 1.5x scale for high quality
                        const canvas = await html2canvas(doc.body, {
                            scale: 1.5,
                            useCORS: true,
                            allowTaint: true,
                            backgroundColor: '#ffffff',
                            width: contentWidth,
                            height: contentHeight,
                            windowWidth: contentWidth,
                            windowHeight: contentHeight,
                        });

                        const imageUrl = canvas.toDataURL('image/png');
                        
                        console.log('[ESignEditor] Document captured:', {
                            iframeWidth: 816,
                            iframeHeight: contentHeight,
                            canvasWidth: canvas.width,
                            canvasHeight: canvas.height,
                            scale: 1.5,
                            expectedWidth: contentWidth * 1.5,
                            expectedHeight: contentHeight * 1.5
                        });
                        
                        // Store the document image and capture dimensions
                        // Field positions will be in the captured image's coordinate space (1224 x height)
                        setDocumentImage(imageUrl);
                        setCaptureWidth(canvas.width);   // 816 * 1.5 = 1224
                        setCaptureHeight(canvas.height); // contentHeight * 1.5
                        
                        setPages([{ pageNumber: 1, imageUrl }]);
                        
                        document.body.removeChild(iframe);
                    }
                } else if (documentUrl) {
                    // Load PDF from URL - in production use pdf.js
                    setPages([
                        { pageNumber: 1, imageUrl: documentUrl }
                    ]);
                }
            } catch (error) {
                console.error('Failed to load document:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadDocument();
    }, [documentUrl, documentHtml]);

    // Add signer
    const addSigner = () => {
        const order = signers.length + 1;
        const role = `signer_${Math.min(order, 3)}` as SignerRole;
        const newSigner: Signer = {
            id: `signer-${Date.now()}`,
            role,
            name: '',
            email: '',
            color: SIGNER_COLORS[role],
            order,
            status: 'pending',
        };
        setSigners([...signers, newSigner]);
    };

    // Remove signer
    const removeSigner = (id: string) => {
        setSigners(signers.filter(s => s.id !== id));
        setFields(fields.filter(f => f.signerId !== id));
        if (selectedSignerId === id) {
            setSelectedSignerId(signers.find(s => s.id !== id)?.id || null);
        }
    };

    // Update signer
    const updateSigner = (id: string, updates: Partial<Signer>) => {
        setSigners(signers.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Handle signature capture
    const handleSignField = (field: SignatureField) => {
        setCaptureField(field);
        setCaptureModalOpen(true);
    };

    const handleCaptureSignature = (signature: SignatureData) => {
        if (!captureField) return;
        
        setFields(fields.map(f => 
            f.id === captureField.id 
                ? { ...f, value: signature.data, signedAt: new Date() }
                : f
        ));
        setCaptureField(null);
    };

    // Validate before sending
    const canSend = () => {
        if (signers.length === 0) return false;
        if (signers.some(s => !s.name || !s.email)) return false;
        if (fields.length === 0) return false;
        // Check each signer has at least one field
        const signerIds = new Set(fields.map(f => f.signerId));
        if (signers.some(s => !signerIds.has(s.id))) return false;
        return true;
    };

    // Handle send
    const handleSend = async () => {
        if (!canSend()) return;
        
        setIsSending(true);
        
        try {
            const envelope: Partial<ESignEnvelope> & {
                documentImageUrl?: string;
                captureWidth?: number;
                captureHeight?: number;
            } = {
                name: documentName,
                signers,
                fields,
                message,
                status: 'sent',
                expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
                // Include captured document image and dimensions for consistent display
                documentImageUrl: documentImage || undefined,
                captureWidth: captureWidth,
                captureHeight: captureHeight || undefined,
            };
            
            await onSend?.(envelope);
            setSendSuccess(true);
            
        } catch (error) {
            console.error('Failed to send:', error);
        } finally {
            setIsSending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading document...</p>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-black">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        className="text-zinc-400 hover:text-white h-8 w-8"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                            <FileText className="h-5 w-5 text-amber-500" />
                            {documentName}
                        </h1>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">
                            {context.type} • {context.entityName}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onSave?.({ signers, fields, message })}
                        className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
                    >
                        <Save className="h-3 w-3 mr-2" />
                        Save Draft
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            // Open document in new window for preview
                            if (pages.length > 0) {
                                const previewWindow = window.open('', '_blank');
                                if (previewWindow) {
                                    previewWindow.document.write(`
                                        <!DOCTYPE html>
                                        <html>
                                        <head>
                                            <title>Preview - ${documentName}</title>
                                            <style>
                                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                                body { 
                                                    background: #18181b; 
                                                    min-height: 100vh;
                                                    padding: 40px;
                                                    display: flex;
                                                    flex-direction: column;
                                                    align-items: center;
                                                }
                                                .header {
                                                    color: #fff;
                                                    font-family: ui-monospace, monospace;
                                                    margin-bottom: 20px;
                                                    text-align: center;
                                                }
                                                .header h1 { font-size: 18px; margin-bottom: 5px; }
                                                .header p { font-size: 12px; color: #71717a; }
                                                .document {
                                                    background: #fff;
                                                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                                                    max-width: 850px;
                                                    width: 100%;
                                                }
                                                .document img { 
                                                    width: 100%; 
                                                    display: block;
                                                }
                                                .actions {
                                                    margin-top: 20px;
                                                    display: flex;
                                                    gap: 10px;
                                                }
                                                .btn {
                                                    padding: 10px 20px;
                                                    font-family: ui-monospace, monospace;
                                                    font-size: 12px;
                                                    border: none;
                                                    cursor: pointer;
                                                    border-radius: 4px;
                                                }
                                                .btn-primary {
                                                    background: #d97706;
                                                    color: #000;
                                                    font-weight: bold;
                                                }
                                                .btn-secondary {
                                                    background: #27272a;
                                                    color: #a1a1aa;
                                                    border: 1px solid #3f3f46;
                                                }
                                                @media print {
                                                    body { background: #fff; padding: 0; }
                                                    .header, .actions { display: none; }
                                                    .document { box-shadow: none; max-width: 100%; }
                                                }
                                            </style>
                                        </head>
                                        <body>
                                            <div class="header">
                                                <h1>${documentName}</h1>
                                                <p>Document Preview</p>
                                            </div>
                                            <div class="document">
                                                <img src="${pages[0]?.imageUrl}" alt="Document" />
                                            </div>
                                            <div class="actions">
                                                <button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
                                                <button class="btn btn-secondary" onclick="window.close()">Close Preview</button>
                                            </div>
                                        </body>
                                        </html>
                                    `);
                                    previewWindow.document.close();
                                }
                            }
                        }}
                        className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
                    >
                        <Eye className="h-3 w-3 mr-2" />
                        Preview
                    </Button>
                    <Button
                        onClick={() => setSendDialogOpen(true)}
                        className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs"
                    >
                        <Send className="h-3 w-3 mr-2" />
                        Send for Signatures
                    </Button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left sidebar - Tabs */}
                <div className="w-80 border-r border-zinc-800 flex flex-col">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full">
                        <TabsList className="bg-zinc-900 border-b border-zinc-800 rounded-none w-full justify-start p-0">
                            <TabsTrigger 
                                value="signers" 
                                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent text-zinc-400 data-[state=active]:text-white font-mono text-xs py-3"
                            >
                                <Users className="h-3 w-3 mr-1" />
                                Signers
                            </TabsTrigger>
                            <TabsTrigger 
                                value="prepare" 
                                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent text-zinc-400 data-[state=active]:text-white font-mono text-xs py-3"
                            >
                                <FileText className="h-3 w-3 mr-1" />
                                Prepare
                            </TabsTrigger>
                            <TabsTrigger 
                                value="settings" 
                                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent text-zinc-400 data-[state=active]:text-white font-mono text-xs py-3"
                            >
                                <Settings className="h-3 w-3 mr-1" />
                                Settings
                            </TabsTrigger>
                        </TabsList>

                        {/* Signers Tab */}
                        <TabsContent value="signers" className="flex-1 overflow-auto p-4 space-y-4 m-0">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-mono uppercase text-amber-500">Recipients</h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addSigner}
                                    className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] h-7"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add
                                </Button>
                            </div>

                            {signers.length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                                    <p className="text-xs font-mono text-zinc-600">No signers added yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {signers.map((signer, index) => (
                                        <Card 
                                            key={signer.id} 
                                            className={`bg-zinc-900 border-zinc-800 cursor-pointer transition-all ${
                                                selectedSignerId === signer.id ? 'ring-2 ring-amber-500' : ''
                                            }`}
                                            onClick={() => setSelectedSignerId(signer.id)}
                                        >
                                            <CardContent className="p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            className="w-3 h-3 rounded-full" 
                                                            style={{ backgroundColor: SIGNER_COLORS[signer.role] }}
                                                        />
                                                        <span className="text-[10px] font-mono uppercase text-zinc-500">
                                                            {SIGNER_LABELS[signer.role]}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeSigner(signer.id);
                                                        }}
                                                        className="h-6 w-6 p-0 text-zinc-600 hover:text-red-500"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <Input
                                                    placeholder="Name"
                                                    value={signer.name}
                                                    onChange={(e) => updateSigner(signer.id, { name: e.target.value })}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="bg-black border-zinc-800 text-white font-mono text-xs h-8 focus:border-amber-500"
                                                />
                                                <Input
                                                    placeholder="Email"
                                                    type="email"
                                                    value={signer.email}
                                                    onChange={(e) => updateSigner(signer.id, { email: e.target.value })}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="bg-black border-zinc-800 text-white font-mono text-xs h-8 focus:border-amber-500"
                                                />
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            {signers.length > 0 && (
                                <p className="text-[10px] font-mono text-zinc-600 text-center mt-4">
                                    Click a signer to select, then add fields in Prepare tab
                                </p>
                            )}
                        </TabsContent>

                        {/* Prepare Tab */}
                        <TabsContent value="prepare" className="flex-1 overflow-auto m-0">
                            {selectedSigner ? (
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-4 p-2 rounded" style={{ backgroundColor: `${SIGNER_COLORS[selectedSigner.role]}20` }}>
                                        <div 
                                            className="w-3 h-3 rounded-full" 
                                            style={{ backgroundColor: SIGNER_COLORS[selectedSigner.role] }}
                                        />
                                        <span className="text-xs font-mono text-white">
                                            Adding fields for: <strong>{selectedSigner.name || SIGNER_LABELS[selectedSigner.role]}</strong>
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-mono text-zinc-500 mb-4">
                                        Drag fields from below onto the document
                                    </p>
                                </div>
                            ) : (
                                <div className="p-4 text-center">
                                    <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                                    <p className="text-xs font-mono text-zinc-500">
                                        Select a signer in the Signers tab first
                                    </p>
                                </div>
                            )}
                        </TabsContent>

                        {/* Settings Tab */}
                        <TabsContent value="settings" className="flex-1 overflow-auto p-4 space-y-4 m-0">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Email Message
                                </Label>
                                <Textarea
                                    placeholder="Add a message for the signers..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="bg-black border-zinc-800 text-white font-mono text-xs focus:border-amber-500 h-24"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-zinc-500">
                                    Expiration
                                </Label>
                                <Select value={String(expirationDays)} onValueChange={(v) => setExpirationDays(Number(v))}>
                                    <SelectTrigger className="bg-black border-zinc-800 text-white font-mono text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        <SelectItem value="7">7 days</SelectItem>
                                        <SelectItem value="14">14 days</SelectItem>
                                        <SelectItem value="30">30 days</SelectItem>
                                        <SelectItem value="60">60 days</SelectItem>
                                        <SelectItem value="90">90 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <h4 className="text-xs font-mono uppercase text-zinc-500 mb-2">Summary</h4>
                                <div className="space-y-1 text-xs font-mono">
                                    <p className="text-zinc-400">
                                        Signers: <span className="text-white">{signers.length}</span>
                                    </p>
                                    <p className="text-zinc-400">
                                        Fields: <span className="text-white">{fields.length}</span>
                                    </p>
                                    <p className="text-zinc-400">
                                        Expires: <span className="text-white">{format(new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}</span>
                                    </p>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Document viewer */}
                <div className="flex-1 bg-zinc-900">
                    <PDFViewer
                        documentUrl={documentUrl || ''}
                        pages={pages}
                        fields={fields}
                        signers={signers}
                        selectedSigner={selectedSigner}
                        mode="prepare"
                        onFieldsChange={setFields}
                        onSignField={handleSignField}
                    />
                </div>
            </div>

            {/* Signature capture modal */}
            <SignatureCapture
                isOpen={captureModalOpen}
                onClose={() => {
                    setCaptureModalOpen(false);
                    setCaptureField(null);
                }}
                onCapture={handleCaptureSignature}
                signerName={captureField ? signers.find(s => s.id === captureField.signerId)?.name : ''}
                isInitials={captureField?.type === 'initials'}
            />

            {/* Send confirmation dialog */}
            <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
                    {sendSuccess ? (
                        <div className="py-8 text-center">
                            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-white font-mono mb-2">Sent Successfully!</h2>
                            <p className="text-sm text-zinc-400 font-mono">
                                Your document has been sent to {signers.length} recipient(s).
                            </p>
                        </div>
                    ) : !canSend() ? (
                        <div className="py-6">
                            <DialogHeader>
                                <DialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                    Cannot Send Yet
                                </DialogTitle>
                                <DialogDescription className="text-zinc-500 font-mono text-xs">
                                    Please complete the following before sending
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 mt-4">
                                {signers.length === 0 && (
                                    <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
                                        <AlertCircle className="h-3 w-3" />
                                        Add at least one signer in the Signers tab
                                    </div>
                                )}
                                {signers.some(s => !s.name || !s.email) && (
                                    <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
                                        <AlertCircle className="h-3 w-3" />
                                        All signers must have name and email
                                    </div>
                                )}
                                {fields.length === 0 && (
                                    <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
                                        <AlertCircle className="h-3 w-3" />
                                        Drag signature fields onto the document in Prepare tab
                                    </div>
                                )}
                                {fields.length > 0 && signers.some(s => !fields.some(f => f.signerId === s.id)) && (
                                    <div className="flex items-center gap-2 p-3 bg-amber-950/30 border border-amber-900/50 rounded text-amber-400 text-xs font-mono">
                                        <AlertCircle className="h-3 w-3" />
                                        Each signer needs at least one field assigned
                                    </div>
                                )}
                            </div>
                            <DialogFooter className="mt-6">
                                <Button
                                    variant="outline"
                                    onClick={() => setSendDialogOpen(false)}
                                    className="border-zinc-800 text-zinc-400 font-mono text-xs"
                                >
                                    Close
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-white font-mono uppercase flex items-center gap-2">
                                    <Send className="h-4 w-4 text-amber-500" />
                                    Sign & Send for Signatures
                                </DialogTitle>
                                <DialogDescription className="text-zinc-500 font-mono text-xs">
                                    Sign as landlord, then send to tenant
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                <div>
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Document</Label>
                                    <p className="text-sm font-mono text-white">{documentName}</p>
                                </div>

                                <div>
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Signing Order</Label>
                                    <div className="space-y-1 mt-1">
                                        {signers.map((signer, idx) => {
                                            const signerFields = fields.filter(f => f.signerId === signer.id);
                                            const signedFields = signerFields.filter(f => f.value);
                                            const isLandlord = idx === 0;
                                            return (
                                                <div key={signer.id} className="flex items-center justify-between p-2 bg-zinc-900 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            className="w-2 h-2 rounded-full" 
                                                            style={{ backgroundColor: SIGNER_COLORS[signer.role] }}
                                                        />
                                                        <div>
                                                            <span className="text-xs font-mono text-white">{signer.name}</span>
                                                            <span className="text-[10px] font-mono text-zinc-500 ml-2">{signer.email}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isLandlord ? (
                                                            signedFields.length === signerFields.length && signerFields.length > 0 ? (
                                                                <Badge className="bg-green-900/50 text-green-400 text-[10px]">
                                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                                    Signed
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-amber-900/50 text-amber-400 text-[10px]">
                                                                    Sign below
                                                                </Badge>
                                                            )
                                                        ) : (
                                                            <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">
                                                                Will receive email
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Landlord signature section */}
                                {signers[0] && fields.filter(f => f.signerId === signers[0].id && !f.value).length > 0 && (
                                    <div className="border border-amber-900/50 rounded-lg p-4 bg-amber-900/10">
                                        <Label className="text-[10px] font-mono uppercase text-amber-500 mb-2 block">
                                            Your Signature Required
                                        </Label>
                                        <p className="text-xs font-mono text-zinc-400 mb-3">
                                            Click below to add your signature as the property owner
                                        </p>
                                        <Button
                                            onClick={() => {
                                                const unsignedField = fields.find(f => f.signerId === signers[0].id && !f.value);
                                                if (unsignedField) {
                                                    handleSignField(unsignedField);
                                                }
                                            }}
                                            className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs"
                                        >
                                            <Pen className="h-3 w-3 mr-2" />
                                            Sign Now
                                        </Button>
                                    </div>
                                )}

                                <div>
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Summary</Label>
                                    <p className="text-sm font-mono text-zinc-400">
                                        {fields.length} signature fields • Expires in {expirationDays} days
                                    </p>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setSendDialogOpen(false)}
                                    className="border-zinc-800 text-zinc-400 font-mono text-xs"
                                    disabled={isSending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSend}
                                    disabled={isSending || (signers[0] && fields.filter(f => f.signerId === signers[0].id).length > 0 && fields.filter(f => f.signerId === signers[0].id && f.value).length === 0)}
                                    className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs disabled:opacity-50"
                                >
                                    {isSending ? (
                                        <>
                                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-3 w-3 mr-2" />
                                            Send to Tenant
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
