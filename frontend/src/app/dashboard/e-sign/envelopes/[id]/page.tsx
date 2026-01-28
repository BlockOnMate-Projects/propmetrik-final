'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { 
    ArrowLeft, 
    FileText, 
    Loader2, 
    AlertCircle, 
    Send, 
    Ban, 
    RefreshCw,
    CheckCircle,
    Clock,
    Eye,
    Download,
    User,
    Mail,
    Calendar,
    Shield,
    History,
    Award,
    FileDown,
    Fingerprint
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { esignApi, ESignEnvelope, EnvelopeStatus, SignerStatus } from '@/lib/property-management-api'
import { CertificateViewer } from '@/components/e-sign'
import { format } from 'date-fns'

export default function EnvelopeViewPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const envelopeId = params.id as string
    const returnUrl = searchParams.get('return') || '/dashboard/property-management/applications'
    
    const [envelope, setEnvelope] = useState<ESignEnvelope | null>(null)
    const [auditLog, setAuditLog] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Document image for viewing with signatures
    const [documentImage, setDocumentImage] = useState<string | null>(null)
    const [isRenderingDocument, setIsRenderingDocument] = useState(false)
    
    // Dialogs
    const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false)
    const [voidReason, setVoidReason] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [showDocument, setShowDocument] = useState(false)
    const [showCertificate, setShowCertificate] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    // Render document as image when dialog opens
    // IMPORTANT: Use the stored document image if available to ensure field positions match
    const renderDocumentImage = useCallback(async () => {
        // If envelope has a pre-rendered image stored, use that for consistent display
        if (envelope?.documentImageUrl) {
            setDocumentImage(envelope.documentImageUrl);
            return;
        }
        
        // Fallback: re-render from HTML (may have slight position differences)
        if (!envelope?.documentHtml) return;
        if (documentImage) return;
        
        setIsRenderingDocument(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            
            // Create hidden iframe to render the HTML (same as ESignEditor)
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '-9999px';
            iframe.style.width = '816px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentDocument;
            if (doc) {
                doc.open();
                doc.write(envelope.documentHtml);
                doc.close();

                // Wait for content to load
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Get the full height of the content
                const contentHeight = doc.body.scrollHeight;

                // Capture the FULL content (not just viewport)
                const canvas = await html2canvas(doc.body, {
                    scale: 1.5,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    width: 816,
                    height: contentHeight,
                    windowWidth: 816,
                    windowHeight: contentHeight,
                });

                const imageUrl = canvas.toDataURL('image/png');
                setDocumentImage(imageUrl);
                
                document.body.removeChild(iframe);
            }
        } catch (err) {
            console.error('Failed to render document image:', err);
        } finally {
            setIsRenderingDocument(false);
        }
    }, [envelope?.documentHtml, envelope?.documentImageUrl, documentImage]);

    // Render document when dialog opens
    useEffect(() => {
        if (showDocument && (envelope?.documentImageUrl || envelope?.documentHtml) && !documentImage) {
            renderDocumentImage();
        }
    }, [showDocument, envelope?.documentImageUrl, envelope?.documentHtml, documentImage, renderDocumentImage]);

    useEffect(() => {
        loadEnvelope()
    }, [envelopeId])

    const loadEnvelope = async () => {
        try {
            setIsLoading(true)
            const [envelopeData, auditData] = await Promise.all([
                esignApi.getEnvelopeById(envelopeId),
                esignApi.getEnvelopeAudit(envelopeId).catch(() => [])
            ])
            setEnvelope(envelopeData)
            setAuditLog(auditData)
            // Reset document image so it re-renders with fresh data
            setDocumentImage(null);
        } catch (err) {
            console.error('Failed to load envelope:', err)
            setError('Failed to load envelope details')
        } finally {
            setIsLoading(false)
        }
    }

    const handleVoid = async () => {
        if (!voidReason.trim()) return
        
        try {
            setIsProcessing(true)
            await esignApi.voidEnvelope(envelopeId, voidReason)
            await loadEnvelope()
            setIsVoidDialogOpen(false)
            setVoidReason('')
        } catch (err) {
            console.error('Failed to void envelope:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleResend = async () => {
        try {
            setIsProcessing(true)
            await esignApi.resendEnvelope(envelopeId)
            await loadEnvelope()
        } catch (err) {
            console.error('Failed to resend envelope:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleDownloadSignedPdf = async () => {
        try {
            setIsDownloading(true)
            const blob = await esignApi.downloadSignedPdf(envelopeId, true)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${envelope?.name?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'document'}_signed.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Failed to download signed PDF:', err)
        } finally {
            setIsDownloading(false)
        }
    }

    const handleDownloadCertificate = async () => {
        try {
            setIsDownloading(true)
            const blob = await esignApi.downloadCertificate(envelopeId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Certificate_${envelope?.name?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'document'}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Failed to download certificate:', err)
        } finally {
            setIsDownloading(false)
        }
    }

    const getStatusBadge = (status: EnvelopeStatus) => {
        const config: Record<EnvelopeStatus, { color: string; icon: React.ReactNode; label: string }> = {
            [EnvelopeStatus.DRAFT]: { 
                color: 'border-zinc-700 text-zinc-400 bg-zinc-800/20', 
                icon: <FileText className="h-3 w-3" />, 
                label: 'Draft' 
            },
            [EnvelopeStatus.SENT]: { 
                color: 'border-blue-900 text-blue-400 bg-blue-900/20', 
                icon: <Send className="h-3 w-3" />, 
                label: 'Sent' 
            },
            [EnvelopeStatus.DELIVERED]: { 
                color: 'border-amber-900 text-amber-400 bg-amber-900/20', 
                icon: <Mail className="h-3 w-3" />, 
                label: 'Delivered' 
            },
            [EnvelopeStatus.SIGNED]: { 
                color: 'border-green-900 text-green-400 bg-green-900/20', 
                icon: <CheckCircle className="h-3 w-3" />, 
                label: 'Signed' 
            },
            [EnvelopeStatus.COMPLETED]: { 
                color: 'border-emerald-900 text-emerald-400 bg-emerald-900/20', 
                icon: <CheckCircle className="h-3 w-3" />, 
                label: 'Completed' 
            },
            [EnvelopeStatus.DECLINED]: { 
                color: 'border-red-900 text-red-400 bg-red-900/20', 
                icon: <Ban className="h-3 w-3" />, 
                label: 'Declined' 
            },
            [EnvelopeStatus.VOIDED]: { 
                color: 'border-red-900 text-red-400 bg-red-900/20', 
                icon: <Ban className="h-3 w-3" />, 
                label: 'Voided' 
            },
            [EnvelopeStatus.EXPIRED]: { 
                color: 'border-zinc-700 text-zinc-400 bg-zinc-800/20', 
                icon: <Clock className="h-3 w-3" />, 
                label: 'Expired' 
            }
        }
        
        const { color, icon, label } = config[status] || config[EnvelopeStatus.DRAFT]
        return (
            <Badge variant="outline" className={`${color} font-mono text-xs flex items-center gap-1`}>
                {icon}
                {label}
            </Badge>
        )
    }

    const getSignerStatusBadge = (status: SignerStatus) => {
        switch (status) {
            case SignerStatus.SIGNED:
                return <Badge className="bg-green-900/50 text-green-400 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Signed</Badge>
            case SignerStatus.SENT:
                return <Badge className="bg-blue-900/50 text-blue-400 text-[10px]"><Send className="h-3 w-3 mr-1" />Sent</Badge>
            case SignerStatus.DELIVERED:
                return <Badge className="bg-amber-900/50 text-amber-400 text-[10px]"><Mail className="h-3 w-3 mr-1" />Delivered</Badge>
            case SignerStatus.PENDING:
                return <Badge className="bg-zinc-800 text-zinc-400 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
            case SignerStatus.DECLINED:
                return <Badge className="bg-red-900/50 text-red-400 text-[10px]"><Ban className="h-3 w-3 mr-1" />Declined</Badge>
            default:
                return <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">{status}</Badge>
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading envelope...</p>
            </div>
        )
    }

    if (error || !envelope) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm">{error || 'Envelope not found'}</p>
                <Button 
                    variant="outline" 
                    className="mt-4 border-zinc-800 text-zinc-400"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back
                </Button>
            </div>
        )
    }

    const canVoid = envelope.status !== EnvelopeStatus.VOIDED && envelope.status !== EnvelopeStatus.COMPLETED
    const canResend = envelope.status === EnvelopeStatus.SENT || envelope.status === EnvelopeStatus.DELIVERED
    const canDownload = envelope?.status === EnvelopeStatus.COMPLETED || envelope?.status === EnvelopeStatus.VOIDED
    const canViewCertificate = envelope?.status === EnvelopeStatus.COMPLETED

    return (
        <div className="min-h-screen bg-black p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.push(returnUrl)}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-white">{envelope.name}</h1>
                            {getStatusBadge(envelope.status)}
                        </div>
                        <p className="text-zinc-500 text-sm mt-1">
                            Created {envelope.createdAt && format(new Date(envelope.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowDocument(true)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                    >
                        <Eye className="h-4 w-4 mr-2" />
                        View Document
                    </Button>
                    {canDownload && (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleDownloadSignedPdf}
                                disabled={isDownloading}
                                className="border-green-700 text-green-400 hover:bg-green-900/30"
                            >
                                {isDownloading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <FileDown className="h-4 w-4 mr-2" />
                                )}
                                Signed PDF
                            </Button>
                            {canViewCertificate && (
                                <Button
                                    variant="outline"
                                    onClick={handleDownloadCertificate}
                                    disabled={isDownloading}
                                    className="border-purple-700 text-purple-400 hover:bg-purple-900/30"
                                >
                                    {isDownloading ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Award className="h-4 w-4 mr-2" />
                                    )}
                                    Certificate
                                </Button>
                            )}
                        </>
                    )}
                    {canResend && (
                        <Button
                            variant="outline"
                            onClick={handleResend}
                            disabled={isProcessing}
                            className="border-blue-700 text-blue-400 hover:bg-blue-900/30"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isProcessing ? 'animate-spin' : ''}`} />
                            Resend
                        </Button>
                    )}
                    {canVoid && (
                        <Button
                            variant="outline"
                            onClick={() => setIsVoidDialogOpen(true)}
                            className="border-red-700 text-red-400 hover:bg-red-900/30"
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            Void
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Signers */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <User className="h-5 w-5 text-blue-400" />
                                Signers
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {envelope.signers?.map((signer, idx) => (
                                    <div 
                                        key={signer.id} 
                                        className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="text-white font-medium">{signer.name}</p>
                                                <p className="text-zinc-500 text-sm">{signer.email}</p>
                                                {signer.role && (
                                                    <p className="text-zinc-600 text-xs font-mono uppercase mt-1">{signer.role}</p>
                                                )}
                                                {/* Permanent Signer ID - visible prominently */}
                                                {signer.permanentSignerId && (
                                                    <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-emerald-900/30 border border-emerald-800 rounded">
                                                        <Shield className="h-3 w-3 text-emerald-400" />
                                                        <span className="text-[11px] font-mono text-emerald-400">
                                                            {signer.permanentSignerId}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {getSignerStatusBadge(signer.status)}
                                            {signer.signedAt && (
                                                <span className="text-zinc-500 text-xs">
                                                    Signed {format(new Date(signer.signedAt), 'MMM d, h:mm a')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Signature Fields */}
                    {envelope.fields && envelope.fields.length > 0 && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-amber-400" />
                                    Signature Fields ({envelope.fields.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {envelope.fields.map((field, idx) => {
                                        const signer = envelope.signers?.find(s => s.id === field.signerId)
                                        return (
                                            <div 
                                                key={field.id} 
                                                className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-mono text-zinc-500 uppercase">
                                                        {field.fieldType}
                                                    </span>
                                                    {field.value ? (
                                                        <Badge className="bg-green-900/50 text-green-400 text-[10px]">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Signed
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">
                                                            Pending
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-white">{signer?.name || 'Unknown signer'}</p>
                                                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-600">
                                                    <span>Page {field.page || 1}</span>
                                                    <span>•</span>
                                                    <span>({field.xPosition?.toFixed(0) || 0}%, {field.yPosition?.toFixed(0) || 0}%)</span>
                                                </div>
                                                {field.value && (
                                                    <>
                                                        <div className="mt-2 bg-white rounded p-2">
                                                            <img 
                                                                src={field.value} 
                                                                alt="Signature"
                                                                className="max-h-12 object-contain"
                                                            />
                                                        </div>
                                                        {/* Permanent Signer ID */}
                                                        {signer?.permanentSignerId && (
                                                            <div className="mt-2 flex items-center gap-2 text-[10px]">
                                                                <User className="h-3 w-3 text-emerald-400" />
                                                                <span className="font-mono text-emerald-400">
                                                                    Signer: {signer.permanentSignerId}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* Signature Hash */}
                                                        {field.signatureHash && (
                                                            <div className="flex items-center gap-2 text-[10px]">
                                                                <Fingerprint className="h-3 w-3 text-purple-400" />
                                                                <span className="font-mono text-purple-400">
                                                                    Hash: {field.signatureHash}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {field.signedAt && (
                                                            <p className="text-[10px] text-zinc-500 mt-1">
                                                                Signed: {format(new Date(field.signedAt), 'MMM d, yyyy h:mm a')}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Envelope Details */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Shield className="h-5 w-5 text-green-400" />
                                Envelope Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {envelope.contextEntityName && (
                                <div>
                                    <p className="text-xs font-mono text-zinc-500 uppercase">For</p>
                                    <p className="text-white">{envelope.contextEntityName}</p>
                                </div>
                            )}
                            {envelope.sentAt && (
                                <div>
                                    <p className="text-xs font-mono text-zinc-500 uppercase">Sent</p>
                                    <p className="text-white">{format(new Date(envelope.sentAt), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                            )}
                            {envelope.expiresAt && (
                                <div>
                                    <p className="text-xs font-mono text-zinc-500 uppercase">Expires</p>
                                    <p className="text-white">{format(new Date(envelope.expiresAt), 'MMM d, yyyy')}</p>
                                </div>
                            )}
                            {envelope.completedAt && (
                                <div>
                                    <p className="text-xs font-mono text-zinc-500 uppercase">Completed</p>
                                    <p className="text-emerald-400">{format(new Date(envelope.completedAt), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                            )}
                            {envelope.voidedAt && (
                                <div>
                                    <p className="text-xs font-mono text-zinc-500 uppercase">Voided</p>
                                    <p className="text-red-400">{format(new Date(envelope.voidedAt), 'MMM d, yyyy h:mm a')}</p>
                                    {envelope.voidReason && (
                                        <p className="text-zinc-400 text-sm mt-1">{envelope.voidReason}</p>
                                    )}
                                </div>
                            )}
                            {/* Certificate Button */}
                            {canViewCertificate && (
                                <div className="pt-4 border-t border-zinc-800">
                                    <Button
                                        onClick={() => setShowCertificate(true)}
                                        variant="outline"
                                        className="w-full border-purple-700 text-purple-400 hover:bg-purple-900/30"
                                    >
                                        <Award className="h-4 w-4 mr-2" />
                                        View Certificate
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Audit Log */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <History className="h-5 w-5 text-purple-400" />
                                Activity Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {auditLog.map((event, idx) => (
                                    <div key={event.id || idx} className="flex items-start gap-3">
                                        <div className="w-2 h-2 rounded-full bg-zinc-600 mt-2" />
                                        <div className="flex-1">
                                            <p className="text-sm text-white capitalize">
                                                {event.eventType.replace(/_/g, ' ')}
                                            </p>
                                            {event.signerName && (
                                                <p className="text-xs text-zinc-500">{event.signerName}</p>
                                            )}
                                            <p className="text-xs text-zinc-600">
                                                {format(new Date(event.createdAt), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {auditLog.length === 0 && (
                                    <p className="text-zinc-500 text-sm text-center py-4">No activity yet</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Void Dialog */}
            <Dialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Ban className="h-5 w-5 text-red-500" />
                            Void Envelope
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            This action cannot be undone. The envelope will be voided and signers will no longer be able to sign.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="text-zinc-400">Reason for voiding</Label>
                        <Textarea
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            placeholder="Enter reason..."
                            className="mt-2 bg-black border-zinc-800 text-white"
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsVoidDialogOpen(false)}
                            className="border-zinc-800 text-zinc-400"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleVoid}
                            disabled={!voidReason.trim() || isProcessing}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isProcessing ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Ban className="h-4 w-4 mr-2" />
                            )}
                            Void Envelope
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Document Dialog */}
            <Dialog open={showDocument} onOpenChange={setShowDocument}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-4xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <FileText className="h-5 w-5 text-amber-500" />
                            {envelope.name}
                            {envelope.fields && envelope.fields.filter(f => f.value).length > 0 && (
                                <Badge className="bg-green-900/50 text-green-400 text-[10px] ml-2">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Signed
                                </Badge>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 bg-white rounded-lg overflow-auto" style={{ height: '70vh' }}>
                        {isRenderingDocument ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-4" />
                                <p className="text-zinc-500 text-sm">Rendering document...</p>
                            </div>
                        ) : documentImage ? (
                            <div 
                                className="relative mx-auto"
                                style={{ width: '816px' }}
                            >
                                {/* Document rendered as image (same as during signing) */}
                                <img 
                                    src={documentImage} 
                                    alt="Document"
                                    style={{ width: '100%', display: 'block' }}
                                />
                                {/* Debug marker at top to verify overlay is working */}
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    left: '10px',
                                    padding: '5px 10px',
                                    background: 'red',
                                    color: 'white',
                                    fontSize: '12px',
                                    zIndex: 200,
                                }}>
                                    Signatures: {envelope.fields?.filter(f => f.value).length || 0} signed fields
                                </div>
                                {/* Overlay signatures at their exact stored positions */}
                                {envelope.fields && envelope.fields.filter(f => f.value).map((field) => {
                                    const signer = envelope.signers?.find(s => s.id === field.signerId)
                                    
                                    // Use stored capture dimensions if available, otherwise assume default 1.5x scale
                                    // Field positions are stored in the captured image coordinate space
                                    // Display: 816px width, Capture: usually 1224px (816 * 1.5)
                                    const captureWidth = envelope.captureWidth || 1224;
                                    const displayWidth = 816;
                                    const scaleRatio = captureWidth / displayWidth;
                                    
                                    const xPos = (field.xPosition || 0) / scaleRatio;
                                    const yPos = (field.yPosition || 0) / scaleRatio;
                                    const fieldDisplayWidth = (field.width || 120) / scaleRatio;
                                    const fieldDisplayHeight = (field.height || 40) / scaleRatio;
                                    
                                    console.log('[Signature Overlay]', {
                                        fieldType: field.fieldType,
                                        storedX: field.xPosition,
                                        storedY: field.yPosition,
                                        displayX: xPos,
                                        displayY: yPos,
                                        scaleRatio,
                                        hasValue: !!field.value
                                    });
                                    
                                    return (
                                        <div
                                            key={field.id}
                                            style={{
                                                position: 'absolute',
                                                left: `${xPos}px`,
                                                top: `${yPos}px`,
                                                width: `${Math.max(fieldDisplayWidth, 80)}px`,
                                                height: `${Math.max(fieldDisplayHeight, 30)}px`,
                                                zIndex: 100,
                                                pointerEvents: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-start',
                                                // Add debug border to see where signatures are placed
                                                border: '2px solid red',
                                                background: 'rgba(255,0,0,0.1)',
                                            }}
                                        >
                                            {(field.fieldType === 'signature' || field.fieldType === 'initials') && field.value ? (
                                                <img 
                                                    src={field.value} 
                                                    alt={`${signer?.name || 'Signature'}`}
                                                    style={{
                                                        maxHeight: '100%',
                                                        maxWidth: '100%',
                                                        objectFit: 'contain',
                                                    }}
                                                />
                                            ) : field.fieldType === 'date_signed' && field.value ? (
                                                <span style={{ fontSize: '12px', color: '#000', fontFamily: 'serif' }}>
                                                    {field.signedAt ? format(new Date(field.signedAt), 'MMM d, yyyy') : field.value}
                                                </span>
                                            ) : field.value ? (
                                                <span style={{ fontSize: '12px', color: '#000' }}>{field.value}</span>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-zinc-500 h-full flex items-center justify-center">
                                Document content not available
                            </div>
                        )}
                    </div>
                    {/* Show signature summary below document */}
                    {envelope.fields && envelope.fields.filter(f => f.value && (f.fieldType === 'signature' || f.fieldType === 'initials')).length > 0 && (
                        <div className="border-t border-zinc-800 pt-4 mt-4">
                            <p className="text-zinc-400 text-xs font-mono uppercase mb-3">Signature Verification</p>
                            <div className="flex flex-wrap gap-4">
                                {envelope.fields.filter(f => f.value && (f.fieldType === 'signature' || f.fieldType === 'initials')).map((field) => {
                                    const signer = envelope.signers?.find(s => s.id === field.signerId)
                                    return (
                                        <div key={field.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white rounded p-2 min-w-[80px]">
                                                    <img 
                                                        src={field.value} 
                                                        alt="Signature"
                                                        className="h-6 object-contain"
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-white text-xs font-medium">{signer?.name || 'Unknown'}</p>
                                                    {field.signedAt && (
                                                        <p className="text-zinc-500 text-[10px]">
                                                            {format(new Date(field.signedAt), 'MMM d, yyyy h:mm a')}
                                                        </p>
                                                    )}
                                                </div>
                                                <CheckCircle className="h-4 w-4 text-green-500" />
                                            </div>
                                            {/* Permanent Signer ID + Signature Hash - DocuSign-style verification */}
                                            <div className="mt-2 pt-2 border-t border-zinc-800 space-y-1">
                                                {signer?.permanentSignerId && (
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3 w-3 text-emerald-400" />
                                                        <span className="text-[10px] font-mono text-emerald-400">
                                                            Signer ID: {signer.permanentSignerId}
                                                        </span>
                                                    </div>
                                                )}
                                                {field.signatureHash && (
                                                    <div className="flex items-center gap-2">
                                                        <Fingerprint className="h-3 w-3 text-purple-400" />
                                                        <span className="text-[10px] font-mono text-purple-400">
                                                            Signature ID: {field.signatureHash}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDocument(false)}
                            className="border-zinc-800 text-zinc-400"
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Certificate Viewer */}
            {envelope && canViewCertificate && (
                <CertificateViewer
                    envelope={envelope}
                    open={showCertificate}
                    onOpenChange={setShowCertificate}
                />
            )}
        </div>
    )
}
