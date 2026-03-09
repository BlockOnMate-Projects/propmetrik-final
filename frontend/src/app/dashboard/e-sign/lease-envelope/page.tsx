'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// =====================================================
// TYPES
// =====================================================

interface LeaseDocumentData {
    documentUrl: string
    documentKey: string
    filename: string
    tenancyId: string
    applicationId: string
    propertyName: string
    signers: Array<{ name: string; email: string; role: string }>
    subject: string
    message: string
}

// =====================================================
// E-SIGN UI INTEGRATION
// =====================================================
// This page embeds the standalone e-sign-ui application which
// handles all PDF rendering, field placement, and sending.
// 
// The e-sign-ui runs on port 3001 and expects:
// 1. Auth token via URL param or postMessage
// 2. Document data via postMessage
// =====================================================

const E_SIGN_UI_URL = process.env.NEXT_PUBLIC_ESIGN_UI_URL || 'http://localhost:3001'

export default function LeaseEnvelopePage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    
    // State
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [leaseData, setLeaseData] = useState<LeaseDocumentData | null>(null)
    const [iframeReady, setIframeReady] = useState(false)

    // Get auth token from cookies/localStorage for e-sign-ui
    const getAuthToken = (): string | null => {
        // Try localStorage first
        if (typeof window !== 'undefined') {
            return localStorage.getItem('token') || localStorage.getItem('auth_token') || null
        }
        return null
    }

    // =====================================================
    // LOAD LEASE DATA
    // =====================================================

    useEffect(() => {
        const loadLeaseData = async () => {
            try {
                setIsLoading(true)
                setError(null)

                // Get lease document data from sessionStorage
                const storedData = sessionStorage.getItem('esign_lease_document')
                if (!storedData) {
                    throw new Error('No lease document data found. Please generate a lease first.')
                }

                const data: LeaseDocumentData = JSON.parse(storedData)
                console.log('📋 Lease-Envelope: Loaded data from sessionStorage:', data)
                console.log('📋 Lease-Envelope: Signers in data:', data.signers)
                setLeaseData(data)
                setIsLoading(false)

            } catch (err: any) {
                console.error('Failed to load lease data:', err)
                setError(err.message || 'Failed to load lease document')
                setIsLoading(false)
            }
        }

        loadLeaseData()
    }, [])

    // =====================================================
    // COMMUNICATE WITH E-SIGN IFRAME
    // =====================================================

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Handle messages from e-sign-ui iframe
            if (event.data?.type === 'ESIGN_READY') {
                setIframeReady(true)
                // Send document data to iframe
                sendDocumentDataToIframe()
            } else if (event.data?.type === 'ESIGN_COMPLETE') {
                // Envelope sent successfully
                router.push(`/dashboard/property-management/applications/${leaseData?.applicationId}?esign=success`)
            } else if (event.data?.type === 'ESIGN_CANCEL') {
                // User cancelled
                router.push(`/dashboard/property-management/applications/${leaseData?.applicationId}`)
            } else if (event.data?.type === 'REQUEST_AUTH_TOKEN') {
                // E-sign UI is requesting auth token
                const token = getAuthToken()
                if (token && iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({
                        type: 'AUTH_TOKEN',
                        token: token
                    }, '*')
                }
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [leaseData, router])

    const sendDocumentDataToIframe = () => {
        if (!iframeRef.current?.contentWindow || !leaseData) return

        console.log('📤 Sending document data to e-sign iframe:', leaseData)
        console.log('📤 Signers being sent:', leaseData.signers)

        // Send document data to e-sign-ui
        iframeRef.current.contentWindow.postMessage({
            type: 'LOAD_DOCUMENT',
            data: {
                documentUrl: leaseData.documentUrl,
                documentKey: leaseData.documentKey,
                filename: leaseData.filename,
                subject: leaseData.subject,
                message: leaseData.message,
                signers: leaseData.signers,
                tenancyId: leaseData.tenancyId,
                applicationId: leaseData.applicationId,
                propertyName: leaseData.propertyName,
            }
        }, '*')
    }

    // Build iframe URL with auth token
    const getIframeUrl = () => {
        const token = getAuthToken()
        const url = new URL(E_SIGN_UI_URL)
        if (token) {
            url.searchParams.set('token', token)
        }
        // Pass flag to indicate this is an embedded mode for lease
        url.searchParams.set('mode', 'embedded')
        url.searchParams.set('source', 'lease-generator')
        return url.toString()
    }

    // =====================================================
    // RENDER
    // =====================================================

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
                    <p className="text-white text-lg">Loading E-Sign...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !leaseData) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="max-w-md text-center">
                    <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
                        <p className="text-red-400">{error || 'No lease document found'}</p>
                    </div>
                    <Link href="/dashboard/property-management/applications">
                        <Button variant="outline" className="border-zinc-700">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Applications
                        </Button>
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={`/dashboard/property-management/applications/${leaseData.applicationId}`}>
                            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">E-Sign: Lease Agreement</h1>
                            <p className="text-sm text-zinc-400">{leaseData.propertyName}</p>
                        </div>
                    </div>
                    
                    {/* Open in new tab option */}
                    <a 
                        href={getIframeUrl()} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm"
                    >
                        Open in new tab
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </div>
            </div>

            {/* E-Sign UI Iframe */}
            <div className="flex-1 relative">
                <iframe
                    ref={iframeRef}
                    src={getIframeUrl()}
                    className="w-full h-full border-0"
                    style={{ minHeight: 'calc(100vh - 80px)' }}
                    title="PROPMETRIK E-Sign"
                    onLoad={() => {
                        // Send auth token when iframe loads
                        const token = getAuthToken()
                        if (token && iframeRef.current?.contentWindow) {
                            setTimeout(() => {
                                iframeRef.current?.contentWindow?.postMessage({
                                    type: 'AUTH_TOKEN',
                                    token: token
                                }, '*')
                                
                                // Also send document data after a short delay
                                setTimeout(sendDocumentDataToIframe, 500)
                            }, 100)
                        }
                    }}
                />
            </div>
        </div>
    )
}
