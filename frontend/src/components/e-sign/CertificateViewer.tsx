'use client'

import React, { useState } from 'react'
import { 
    Award, 
    Download, 
    Loader2, 
    CheckCircle,
    FileText,
    User,
    Calendar,
    Shield,
    Fingerprint,
    Clock,
    ExternalLink
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
import { Separator } from '@/components/ui/separator'
import { ESignEnvelope, esignApi } from '@/lib/property-management-api'
import { format } from 'date-fns'

interface CertificateViewerProps {
    envelope: ESignEnvelope
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CertificateViewer({ envelope, open, onOpenChange }: CertificateViewerProps) {
    const [isDownloading, setIsDownloading] = useState(false)

    const handleDownload = async () => {
        try {
            setIsDownloading(true)
            const blob = await esignApi.downloadCertificate(envelope.id)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Certificate_${envelope.name?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'document'}.pdf`
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

    // Calculate stats
    const signedCount = envelope.signers?.filter(s => s.signedAt).length || 0
    const totalSigners = envelope.signers?.length || 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-3">
                        <div className="p-2 bg-purple-900/50 rounded-lg">
                            <Award className="h-6 w-6 text-purple-400" />
                        </div>
                        Certificate of Completion
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        This document certifies that all required signatures have been collected
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Certificate Summary */}
                    <Card className="bg-gradient-to-br from-purple-900/20 to-zinc-900/50 border-purple-900/50">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-purple-900/30 rounded-full">
                                    <CheckCircle className="h-8 w-8 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Document Complete</h3>
                                    <p className="text-purple-400 text-sm">All signatures collected</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-900/50 rounded-lg p-3">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Document</p>
                                    <p className="text-white font-medium truncate mt-1">{envelope.name}</p>
                                </div>
                                <div className="bg-zinc-900/50 rounded-lg p-3">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Completed</p>
                                    <p className="text-white font-medium mt-1">
                                        {envelope.completedAt && format(new Date(envelope.completedAt), 'MMM d, yyyy h:mm a')}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Signers Summary */}
                    <div>
                        <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                            <User className="h-4 w-4 text-blue-400" />
                            Signers ({signedCount}/{totalSigners})
                        </h4>
                        <div className="space-y-2">
                            {envelope.signers?.map((signer, idx) => (
                                <div 
                                    key={signer.id}
                                    className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white font-bold text-sm">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{signer.name}</p>
                                            <p className="text-zinc-500 text-xs">{signer.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {signer.signedAt ? (
                                            <>
                                                <Badge className="bg-green-900/50 text-green-400 text-[10px]">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Signed
                                                </Badge>
                                                <p className="text-[10px] text-zinc-500 mt-1">
                                                    {format(new Date(signer.signedAt), 'MMM d, h:mm a')}
                                                </p>
                                            </>
                                        ) : (
                                            <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">
                                                <Clock className="h-3 w-3 mr-1" />
                                                Pending
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Certificate Info */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Shield className="h-4 w-4 text-green-400" />
                            <span className="text-sm font-medium text-white">Certificate Information</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-zinc-500 text-xs">Envelope ID</p>
                                <p className="text-zinc-300 font-mono text-xs truncate">{envelope.id}</p>
                            </div>
                            <div>
                                <p className="text-zinc-500 text-xs">Context</p>
                                <p className="text-zinc-300 text-xs">{envelope.contextEntityName || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-zinc-500 text-xs">Created</p>
                                <p className="text-zinc-300 text-xs">
                                    {envelope.createdAt && format(new Date(envelope.createdAt), 'MMM d, yyyy')}
                                </p>
                            </div>
                            <div>
                                <p className="text-zinc-500 text-xs">Sent</p>
                                <p className="text-zinc-300 text-xs">
                                    {envelope.sentAt && format(new Date(envelope.sentAt), 'MMM d, yyyy')}
                                </p>
                            </div>
                        </div>
                        <Separator className="my-3 bg-zinc-800" />
                        <p className="text-[10px] text-zinc-600 flex items-center gap-1">
                            <Fingerprint className="h-3 w-3" />
                            Document integrity verified with SHA-256 hash
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="border-zinc-800 text-zinc-400"
                    >
                        Close
                    </Button>
                    <Button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {isDownloading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Download PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
