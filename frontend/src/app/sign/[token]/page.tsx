'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
    Loader2, 
    AlertCircle, 
    CheckCircle, 
    ChevronLeft, 
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Pen,
    FileCheck,
    Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SignatureCapture } from '@/components/e-sign'
import type { SignatureField, SignatureData } from '@/components/e-sign/types'

interface SigningDocument {
    id: string
    title: string
    pages: { pageNumber: number; imageUrl: string }[]
    fields: SignatureField[]
    signer: {
        id: string
        name: string
        email: string
        role: string
    }
    status: 'pending' | 'in_progress' | 'completed'
}

export default function ExternalSigningPage({ params }: { params: { token: string } }) {
    const router = useRouter()
    
    // States
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [document, setDocument] = useState<SigningDocument | null>(null)
    
    // OTP verification
    const [otpSent, setOtpSent] = useState(false)
    const [otpCode, setOtpCode] = useState('')
    const [otpVerified, setOtpVerified] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    
    // Signing state
    const [currentPage, setCurrentPage] = useState(1)
    const [zoom, setZoom] = useState(1)
    const [completedFields, setCompletedFields] = useState<Record<string, SignatureData>>({})
    const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
    const [showCaptureModal, setShowCaptureModal] = useState(false)
    
    // Submitting
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isComplete, setIsComplete] = useState(false)
    
    // Refs
    const containerRef = useRef<HTMLDivElement>(null)

    // Load document and send OTP
    useEffect(() => {
        const loadDocument = async () => {
            try {
                setIsLoading(true)
                
                // Call API to validate token and get document info
                const response = await fetch(`/api/e-sign/verify-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: params.token })
                })

                if (!response.ok) {
                    const data = await response.json()
                    throw new Error(data.error || 'Invalid or expired signing link')
                }

                const data = await response.json()
                setDocument(data.document)
                setOtpSent(data.otpSent)
                
            } catch (err) {
                console.error('Failed to load document:', err)
                setError(err instanceof Error ? err.message : 'Failed to load document')
            } finally {
                setIsLoading(false)
            }
        }

        loadDocument()
    }, [params.token])

    // Verify OTP
    const handleVerifyOtp = async () => {
        if (otpCode.length !== 6) return

        try {
            setIsVerifying(true)
            
            const response = await fetch(`/api/e-sign/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: params.token, code: otpCode })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Invalid verification code')
            }

            setOtpVerified(true)
        } catch (err) {
            console.error('OTP verification failed:', err)
            setError(err instanceof Error ? err.message : 'Verification failed')
        } finally {
            setIsVerifying(false)
        }
    }

    // Resend OTP
    const handleResendOtp = async () => {
        try {
            const response = await fetch(`/api/e-sign/resend-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: params.token })
            })

            if (response.ok) {
                setOtpCode('')
                setError(null)
            }
        } catch (err) {
            console.error('Failed to resend OTP:', err)
        }
    }

    // Handle field click
    const handleFieldClick = (fieldId: string) => {
        if (completedFields[fieldId]) return // Already signed
        
        const field = document?.fields.find(f => f.id === fieldId)
        if (!field) return

        if (field.type === 'signature' || field.type === 'initials') {
            setActiveFieldId(fieldId)
            setShowCaptureModal(true)
        } else if (field.type === 'date') {
            // Auto-fill date
            setCompletedFields(prev => ({
                ...prev,
                [fieldId]: {
                    type: 'typed',
                    data: new Date().toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    })
                }
            }))
        } else if (field.type === 'checkbox') {
            // Toggle checkbox
            setCompletedFields(prev => ({
                ...prev,
                [fieldId]: {
                    type: 'typed',
                    data: prev[fieldId]?.data === 'checked' ? '' : 'checked'
                }
            }))
        }
    }

    // Handle signature capture
    const handleSignatureCapture = (signatureData: SignatureData) => {
        if (activeFieldId) {
            setCompletedFields(prev => ({
                ...prev,
                [activeFieldId]: signatureData
            }))
        }
        setShowCaptureModal(false)
        setActiveFieldId(null)
    }

    // Check if all required fields are complete
    const allFieldsComplete = useCallback(() => {
        if (!document) return false
        const requiredFields = document.fields.filter(f => f.required && f.signerId === document.signer.id)
        return requiredFields.every(f => completedFields[f.id])
    }, [document, completedFields])

    // Submit signed document
    const handleSubmit = async () => {
        if (!allFieldsComplete()) return

        try {
            setIsSubmitting(true)

            const response = await fetch(`/api/e-sign/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: params.token,
                    signatures: completedFields
                })
            })

            if (!response.ok) {
                throw new Error('Failed to submit signatures')
            }

            setIsComplete(true)
        } catch (err) {
            console.error('Submit failed:', err)
            setError('Failed to submit signatures. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Get fields for current page
    const currentPageFields = document?.fields.filter(f => 
        f.page === currentPage && f.signerId === document?.signer.id
    ) || []

    // Count completed vs total
    const myFields = document?.fields.filter(f => f.signerId === document?.signer.id) || []
    const completedCount = myFields.filter(f => completedFields[f.id]).length

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-4" />
                    <p className="text-zinc-400 font-mono text-sm">Loading document...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error && !document) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900 rounded-lg border border-zinc-800 p-8 text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Unable to Load Document</h1>
                    <p className="text-zinc-400 mb-6">{error}</p>
                    <p className="text-sm text-zinc-500">
                        This link may have expired or already been used. 
                        Please contact the sender for a new signing link.
                    </p>
                </div>
            </div>
        )
    }

    // OTP verification screen
    if (!otpVerified && document) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900 rounded-lg border border-zinc-800 p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-amber-500" />
                        </div>
                        <h1 className="text-xl font-bold text-white mb-2">Verify Your Identity</h1>
                        <p className="text-zinc-400 text-sm">
                            We&apos;ve sent a verification code to your email at<br />
                            <span className="text-white font-mono">{document.signer.email}</span>
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">
                                Enter 6-digit code
                            </label>
                            <Input
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                className="bg-zinc-800 border-zinc-700 text-white text-center text-2xl tracking-widest font-mono"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-center">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        <Button
                            onClick={handleVerifyOtp}
                            disabled={otpCode.length !== 6 || isVerifying}
                            className="w-full bg-amber-600 hover:bg-amber-700"
                        >
                            {isVerifying ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                            ) : (
                                'Verify & Continue'
                            )}
                        </Button>

                        <div className="text-center">
                            <button 
                                onClick={handleResendOtp}
                                className="text-sm text-zinc-500 hover:text-zinc-300"
                            >
                                Didn&apos;t receive the code? <span className="text-amber-500">Resend</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Completion screen
    if (isComplete) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900 rounded-lg border border-zinc-800 p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Document Signed!</h1>
                    <p className="text-zinc-400 mb-6">
                        Your signature has been recorded. You will receive a copy of the 
                        fully signed document once all parties have signed.
                    </p>
                    <div className="bg-zinc-800 rounded p-4 text-left mb-6">
                        <p className="text-xs text-zinc-500 mb-1">Document</p>
                        <p className="text-white font-mono text-sm">{document?.title}</p>
                    </div>
                    <p className="text-xs text-zinc-500">
                        A confirmation email has been sent to {document?.signer.email}
                    </p>
                </div>
            </div>
        )
    }

    // Main signing interface
    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileCheck className="w-6 h-6 text-amber-500" />
                        <div>
                            <h1 className="text-white font-medium">{document?.title}</h1>
                            <p className="text-xs text-zinc-500">Signing as {document?.signer.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-zinc-500">Progress</p>
                            <p className="text-amber-500 font-mono text-sm">
                                {completedCount} / {myFields.length} fields
                            </p>
                        </div>
                        <Button
                            onClick={handleSubmit}
                            disabled={!allFieldsComplete() || isSubmitting}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                            ) : (
                                'Finish Signing'
                            )}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Document viewer */}
            <div className="flex-1 overflow-auto p-4" ref={containerRef}>
                <div className="max-w-4xl mx-auto">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-4 bg-zinc-900 rounded-lg border border-zinc-800 p-2">
                        {/* Page navigation */}
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-zinc-400 font-mono">
                                Page {currentPage} of {document?.pages.length || 1}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(document?.pages.length || 1, p + 1))}
                                disabled={currentPage === (document?.pages.length || 1)}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Zoom controls */}
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                            >
                                <ZoomOut className="w-4 h-4" />
                            </Button>
                            <span className="text-xs text-zinc-400 font-mono w-12 text-center">
                                {Math.round(zoom * 100)}%
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                            >
                                <ZoomIn className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Document page */}
                    <div className="relative bg-white shadow-lg mx-auto" style={{
                        width: 612 * zoom,
                        height: 792 * zoom,
                    }}>
                        {/* Page image */}
                        {document?.pages[currentPage - 1] && (
                            <img
                                src={document.pages[currentPage - 1].imageUrl}
                                alt={`Page ${currentPage}`}
                                className="w-full h-full object-contain"
                            />
                        )}

                        {/* Signature fields */}
                        {currentPageFields.map(field => {
                            const isCompleted = !!completedFields[field.id]
                            const signature = completedFields[field.id]

                            return (
                                <div
                                    key={field.id}
                                    onClick={() => handleFieldClick(field.id)}
                                    className={`absolute flex items-center justify-center rounded border-2 transition-all cursor-pointer ${
                                        isCompleted 
                                            ? 'border-emerald-500 bg-emerald-50'
                                            : 'border-amber-500 bg-amber-50 hover:bg-amber-100 animate-pulse'
                                    }`}
                                    style={{
                                        left: `${field.x}%`,
                                        top: `${field.y}%`,
                                        width: `${field.width}%`,
                                        height: `${field.height}%`,
                                    }}
                                >
                                    {isCompleted ? (
                                        // Show signature
                                        signature?.type === 'drawn' || signature?.type === 'uploaded' ? (
                                            <img 
                                                src={signature.data} 
                                                alt="Signature"
                                                className="w-full h-full object-contain p-1"
                                            />
                                        ) : signature?.type === 'typed' ? (
                                            <span 
                                                className="text-xs font-script text-zinc-800"
                                                style={{ 
                                                    fontFamily: signature.fontFamily || 'cursive',
                                                    fontSize: field.type === 'date' ? '10px' : '14px'
                                                }}
                                            >
                                                {signature.data}
                                            </span>
                                        ) : field.type === 'checkbox' ? (
                                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                                        ) : null
                                    ) : (
                                        // Show placeholder
                                        <div className="text-center">
                                            {field.type === 'signature' && (
                                                <>
                                                    <Pen className="w-4 h-4 text-amber-600 mx-auto mb-0.5" />
                                                    <span className="text-[8px] text-amber-700 font-medium">
                                                        Sign Here
                                                    </span>
                                                </>
                                            )}
                                            {field.type === 'initials' && (
                                                <>
                                                    <span className="text-xs text-amber-700 font-bold">AB</span>
                                                    <span className="text-[8px] text-amber-700 block">
                                                        Initial
                                                    </span>
                                                </>
                                            )}
                                            {field.type === 'date' && (
                                                <span className="text-[8px] text-amber-700 font-medium">
                                                    Date
                                                </span>
                                            )}
                                            {field.type === 'checkbox' && (
                                                <span className="text-[10px] text-amber-700">☐</span>
                                            )}
                                            {field.type === 'text' && (
                                                <span className="text-[8px] text-amber-700 font-medium">
                                                    {field.label || 'Text'}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Fields to complete indicator */}
                    {myFields.length > 0 && completedCount < myFields.length && (
                        <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                            <p className="text-amber-400 text-sm text-center">
                                Click on the highlighted fields to add your signature
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Signature capture modal */}
            {showCaptureModal && activeFieldId && (
                <SignatureCapture
                    isOpen={showCaptureModal}
                    onClose={() => {
                        setShowCaptureModal(false)
                        setActiveFieldId(null)
                    }}
                    onCapture={handleSignatureCapture}
                    signerName={document?.signer.name || ''}
                    isInitials={document?.fields.find(f => f.id === activeFieldId)?.type === 'initials'}
                />
            )}
        </div>
    )
}
