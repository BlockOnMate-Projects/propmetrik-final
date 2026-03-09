'use client'

/**
 * Report E-Sign Envelope Page
 * 
 * Mirrors the lease-envelope flow: embeds the e-sign-ui as an iframe,
 * passes the valuation report DOCX for field placement and self-signing.
 * On completion, calls the approve endpoint to finalise the report.
 * 
 * Now includes a mode selection screen allowing the user to choose between:
 * 1. Self-sign: User signs the report themselves
 * 2. Send to qualified valuer: Forward to another professional for signing
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, ExternalLink, CheckCircle, PenTool, Send, User } from 'lucide-react'
import Link from 'next/link'

// =====================================================
// TYPES
// =====================================================

type SigningMode = 'select' | 'self_signed' | 'send_to_valuer'

interface ReportEsignData {
  reportId: string
  valuationId: string
  documentUrl: string
  documentKey: string
  filename: string
  propertyAddress: string
  valuer: {
    id: string
    name: string
    title: string | null
    email: string
    qualifications: string | null
    license_number: string | null
  }
  signers: Array<{ name: string; email: string; role: string; order?: number }>
  subject: string
  message: string
}

// =====================================================
// CONSTANTS
// =====================================================

const E_SIGN_UI_URL = process.env.NEXT_PUBLIC_ESIGN_UI_URL || 'http://localhost:3001'
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export default function ReportEnvelopePage() {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [esignData, setEsignData] = useState<ReportEsignData | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [approvalResult, setApprovalResult] = useState<any>(null)

  // Signing mode selection
  const [signingMode, setSigningMode] = useState<SigningMode>('select')
  const [qualifiedValuerName, setQualifiedValuerName] = useState('')
  const [qualifiedValuerEmail, setQualifiedValuerEmail] = useState('')
  const [valuerConfirmed, setValuerConfirmed] = useState(false)

  // Auth token
  const getAuthToken = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pm_access_token') || localStorage.getItem('token') || localStorage.getItem('auth_token') || null
    }
    return null
  }

  // =====================================================
  // LOAD ESIGN DATA FROM sessionStorage
  // =====================================================

  useEffect(() => {
    try {
      setIsLoading(true)
      setError(null)

      const storedData = sessionStorage.getItem('esign_report_document')
      if (!storedData) {
        throw new Error('No report e-sign data found. Please click "Approve & Sign" from the report page.')
      }

      const data: ReportEsignData = JSON.parse(storedData)
      console.log('📋 Report-Envelope: Loaded data from sessionStorage:', data)
      setEsignData(data)
      setIsLoading(false)
    } catch (err: any) {
      console.error('Failed to load report e-sign data:', err)
      setError(err.message || 'Failed to load report data')
      setIsLoading(false)
    }
  }, [])

  // =====================================================
  // COMMUNICATE WITH E-SIGN IFRAME
  // =====================================================

  const sendDocumentDataToIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !esignData) return

    console.log('📤 Sending report document data to e-sign iframe, mode:', signingMode)

    // Build signers list based on mode
    let signers = esignData.signers
    let contextType = 'self_signed'

    if (signingMode === 'send_to_valuer') {
      // Replace signers with the qualified valuer
      signers = [
        { name: qualifiedValuerName, email: qualifiedValuerEmail, role: 'signer', order: 1 }
      ]
      contextType = 'send_to_signer'
    }

    iframeRef.current.contentWindow.postMessage({
      type: 'LOAD_DOCUMENT',
      data: {
        documentUrl: esignData.documentUrl,
        documentKey: esignData.documentKey,
        filename: esignData.filename,
        subject: esignData.subject,
        message: esignData.message,
        signers,
        contextType,
        contextEntityId: esignData.reportId,
        contextEntityName: `Valuation Report - ${esignData.propertyAddress}`,
      }
    }, '*')
  }, [esignData, signingMode, qualifiedValuerName, qualifiedValuerEmail])

  // Handle approval after signing
  const handleApproveAfterSign = useCallback(async () => {
    if (!esignData || isApproving) return

    setIsApproving(true)
    setError(null)

    try {
      console.log('✅ E-sign complete, approving report...')

      const response = await authedFetch(`${API_BASE}/reports/${esignData.reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuer_id: esignData.valuer.id,
          comments: 'Approved via e-sign workflow',
          generate_pdf: true,
        }),
      })

      const result = await response.json()
      console.log('✅ Approval result:', result)

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Approval failed')
      }

      setApprovalResult(result)
      setIsApproved(true)

      // Clean up sessionStorage
      sessionStorage.removeItem('esign_report_document')
    } catch (err: any) {
      console.error('Failed to approve report after signing:', err)
      setError(err.message || 'Failed to approve report')
    } finally {
      setIsApproving(false)
    }
  }, [esignData, isApproving])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ESIGN_READY') {
        sendDocumentDataToIframe()
      } else if (event.data?.type === 'ESIGN_COMPLETE') {
        // Signing completed — now approve the report
        handleApproveAfterSign()
      } else if (event.data?.type === 'ESIGN_CANCEL') {
        // User cancelled — go back to report page
        if (esignData) {
          router.push(`/dashboard/valuations/${esignData.valuationId}/report`)
        } else {
          router.push('/dashboard/valuations')
        }
      } else if (event.data?.type === 'REQUEST_AUTH_TOKEN') {
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
  }, [esignData, router, sendDocumentDataToIframe, handleApproveAfterSign])

  // Build iframe URL
  const getIframeUrl = () => {
    const token = getAuthToken()
    const url = new URL(E_SIGN_UI_URL)
    if (token) {
      url.searchParams.set('token', token)
    }
    url.searchParams.set('mode', 'embedded')
    url.searchParams.set('source', 'report-approval')
    return url.toString()
  }

  // Back URL
  const getBackUrl = () => {
    if (esignData) {
      return `/dashboard/valuations/${esignData.valuationId}/report`
    }
    return '/dashboard/valuations'
  }

  // =====================================================
  // RENDER — LOADING
  // =====================================================

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

  // =====================================================
  // RENDER — APPROVED SUCCESS
  // =====================================================

  if (isApproved && approvalResult) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Report Approved</h2>
          <p className="text-zinc-400 mb-2">
            The valuation report for <strong className="text-white">{esignData?.propertyAddress}</strong> has been signed and approved.
          </p>
          {approvalResult.digital_seal_hash && (
            <p className="text-xs text-zinc-500 mb-6 font-mono">
              Seal: {approvalResult.digital_seal_hash.substring(0, 16)}...
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Link href={getBackUrl()}>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                View Report
              </Button>
            </Link>
            <Link href="/dashboard/valuations">
              <Button variant="outline" className="border-zinc-700 text-zinc-300">
                Back to Valuations
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — APPROVING
  // =====================================================

  if (isApproving) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-white text-lg">Approving & generating PDF...</p>
          <p className="text-zinc-400 text-sm mt-2">This may take a moment</p>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — ERROR
  // =====================================================

  if (error || !esignData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-red-400">{error || 'No report e-sign data found'}</p>
          </div>
          <Link href={getBackUrl()}>
            <Button variant="outline" className="border-zinc-700">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Report
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — MODE SELECTION
  // =====================================================

  if (signingMode === 'select' && !isApproved && !isApproving) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={getBackUrl()}>
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">E-Sign: Valuation Report Approval</h1>
              <p className="text-sm text-zinc-400">
                {esignData?.propertyAddress} &mdash; {esignData?.valuer.name}
              </p>
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-xl space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">How would you like to proceed?</h2>
              <p className="text-zinc-400">Choose how this valuation report should be signed and approved.</p>
            </div>

            {/* Option 1: Self Sign */}
            <button
              onClick={() => setSigningMode('self_signed')}
              className="w-full bg-zinc-900 border-2 border-zinc-700 hover:border-emerald-500 rounded-xl p-6 text-left transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="bg-emerald-600/20 rounded-lg p-3 group-hover:bg-emerald-600/30 transition-colors">
                  <PenTool className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">Sign it myself</h3>
                  <p className="text-sm text-zinc-400">
                    I am a qualified valuer and will sign this report directly. The report will be approved and
                    sealed immediately after signing.
                  </p>
                </div>
                <div className="mt-1">
                  <div className="w-5 h-5 rounded-full border-2 border-zinc-600 group-hover:border-emerald-500 flex items-center justify-center transition-colors">
                    <div className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-emerald-500 transition-colors" />
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Send to Qualified Valuer */}
            <div className="w-full">
              <button
                onClick={() => setSigningMode('send_to_valuer')}
                className="w-full bg-zinc-900 border-2 border-zinc-700 hover:border-blue-500 rounded-xl p-6 text-left transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-blue-600/20 rounded-lg p-3 group-hover:bg-blue-600/30 transition-colors">
                    <Send className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">Send to a qualified valuer</h3>
                    <p className="text-sm text-zinc-400">
                      Forward this report to another qualified valuer for review and signing.
                      They will receive an email with a link to sign the document.
                    </p>
                  </div>
                  <div className="mt-1">
                    <div className="w-5 h-5 rounded-full border-2 border-zinc-600 group-hover:border-blue-500 flex items-center justify-center transition-colors">
                      <div className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-blue-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — QUALIFIED VALUER INPUT (after choosing "send to valuer")
  // =====================================================

  if (signingMode === 'send_to_valuer' && !valuerConfirmed && !isApproved && !isApproving) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
              onClick={() => setSigningMode('select')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-white">Send to Qualified Valuer</h1>
              <p className="text-sm text-zinc-400">
                {esignData?.propertyAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Valuer Input Form */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center mb-4">
              <div className="bg-blue-600/20 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <User className="h-8 w-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Qualified Valuer Details</h2>
              <p className="text-zinc-400 text-sm">Enter the details of the qualified valuer who will sign this report.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={qualifiedValuerName}
                  onChange={(e) => setQualifiedValuerName(e.target.value)}
                  placeholder="e.g. Dr. Kwame Asare"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={qualifiedValuerEmail}
                  onChange={(e) => setQualifiedValuerEmail(e.target.value)}
                  placeholder="e.g. k.asare@valuation.com"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-zinc-700 text-zinc-300"
                onClick={() => {
                  setSigningMode('select')
                  setQualifiedValuerName('')
                  setQualifiedValuerEmail('')
                  setValuerConfirmed(false)
                }}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!qualifiedValuerName.trim() || !qualifiedValuerEmail.trim() || !qualifiedValuerEmail.includes('@')}
                onClick={() => setValuerConfirmed(true)}
              >
                <Send className="mr-2 h-4 w-4" />
                Continue to E-Sign
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — E-SIGN IFRAME
  // =====================================================

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={getBackUrl()}>
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">E-Sign: Valuation Report Approval</h1>
              <p className="text-sm text-zinc-400">
                {esignData.propertyAddress} &mdash; {esignData.valuer.name}
              </p>
            </div>
          </div>

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
          title="PROPMETRIK E-Sign - Report Approval"
          onLoad={() => {
            console.log('📋 E-sign iframe loaded, sending auth + document data')
            const token = getAuthToken()
            if (iframeRef.current?.contentWindow) {
              // Send auth token first
              if (token) {
                iframeRef.current.contentWindow.postMessage({
                  type: 'AUTH_TOKEN',
                  token: token
                }, '*')
              }

              // Send document data after a short delay to let iframe initialize
              setTimeout(() => {
                sendDocumentDataToIframe()
              }, 800)
            }
          }}
        />
      </div>
    </div>
  )
}
