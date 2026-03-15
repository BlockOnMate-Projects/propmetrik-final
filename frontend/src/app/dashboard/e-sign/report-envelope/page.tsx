'use client'

/**
 * Report E-Sign Envelope Page
 *
 * Inline signing flow for valuation report approval.
 * Uses the built-in SignatureModal instead of an external iframe.
 *
 * Flow:
 * 1. Load report data from sessionStorage
 * 2. Mode selection: Self-sign or Send to qualified valuer
 * 3. Self-sign: Show document summary + signature capture
 * 4. On sign: Call approve endpoint to finalise the report
 *
 * Includes retry button on error (Recommendation 5).
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, CheckCircle, PenTool, Send, User, FileText, RefreshCw, Shield } from 'lucide-react'
import Link from 'next/link'
import SignatureModal from '@/components/esign/SignatureModal'
import { SignatureData } from '@/lib/esign-types'

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export default function ReportEnvelopePage() {
  const router = useRouter()

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

  // Inline signing state
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null)

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
      setEsignData(data)
      setIsLoading(false)
    } catch (err: any) {
      console.error('Failed to load report e-sign data:', err)
      setError(err.message || 'Failed to load report data')
      setIsLoading(false)
    }
  }, [])

  // =====================================================
  // HANDLE APPROVAL AFTER SIGNING
  // =====================================================

  const handleApproveAfterSign = useCallback(async (signature?: SignatureData) => {
    if (!esignData || isApproving) return

    setIsApproving(true)
    setError(null)

    try {
      const response = await authedFetch(`${API_BASE}/reports/${esignData.reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuer_id: esignData.valuer.id,
          comments: 'Approved via e-sign workflow',
          generate_pdf: true,
          signature_data: signature?.data || signatureData?.data,
        }),
      })

      const result = await response.json()

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
  }, [esignData, isApproving, signatureData])

  // Handle signature applied from modal
  const handleSignatureApplied = useCallback((sig: SignatureData) => {
    setSignatureData(sig)
    setShowSignatureModal(false)
    // Immediately approve after signing
    handleApproveAfterSign(sig)
  }, [handleApproveAfterSign])

  // Retry approval (Recommendation 5)
  const handleRetry = useCallback(() => {
    setError(null)
    if (signatureData) {
      // Already signed — retry the approval call
      handleApproveAfterSign(signatureData)
    } else {
      // No signature yet — re-show the signing UI
      setShowSignatureModal(true)
    }
  }, [signatureData, handleApproveAfterSign])

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
  // RENDER — ERROR (with retry button — Recommendation 5)
  // =====================================================

  if (error && esignData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-red-400">{error}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleRetry}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {signatureData ? 'Retry Approval' : 'Try Again'}
            </Button>
            <Link href={getBackUrl()}>
              <Button variant="outline" className="border-zinc-700">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Report
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!esignData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-red-400">No report e-sign data found</p>
          </div>
          <Link href="/dashboard/valuations">
            <Button variant="outline" className="border-zinc-700">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Valuations
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — MODE SELECTION
  // =====================================================

  if (signingMode === 'select') {
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
                {esignData.propertyAddress} &mdash; {esignData.valuer.name}
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
    )
  }

  // =====================================================
  // RENDER — QUALIFIED VALUER INPUT
  // =====================================================

  if (signingMode === 'send_to_valuer' && !valuerConfirmed) {
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
                {esignData.propertyAddress}
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
  // RENDER — INLINE SIGNING (replaces iframe)
  // =====================================================

  const signerName = signingMode === 'send_to_valuer'
    ? qualifiedValuerName
    : esignData.valuer.name

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:text-white"
            onClick={() => {
              setSignatureData(null)
              if (signingMode === 'send_to_valuer') {
                setValuerConfirmed(false)
              } else {
                setSigningMode('select')
              }
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-white">E-Sign: Valuation Report Approval</h1>
            <p className="text-sm text-zinc-400">
              {esignData.propertyAddress} &mdash; {signerName}
            </p>
          </div>
        </div>
      </div>

      {/* Document Summary & Signing Area */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl space-y-8">
          {/* Document Info Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-emerald-600/20 rounded-lg p-3">
                <FileText className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white mb-1">Valuation Report</h2>
                <p className="text-sm text-zinc-400">{esignData.filename}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Property</span>
                <p className="text-white mt-0.5">{esignData.propertyAddress}</p>
              </div>
              <div>
                <span className="text-zinc-500">Valuer</span>
                <p className="text-white mt-0.5">{esignData.valuer.name}</p>
                {esignData.valuer.qualifications && (
                  <p className="text-zinc-400 text-xs">{esignData.valuer.qualifications}</p>
                )}
              </div>
              {esignData.valuer.license_number && (
                <div>
                  <span className="text-zinc-500">License</span>
                  <p className="text-white mt-0.5">{esignData.valuer.license_number}</p>
                </div>
              )}
              {esignData.valuer.title && (
                <div>
                  <span className="text-zinc-500">Title</span>
                  <p className="text-white mt-0.5">{esignData.valuer.title}</p>
                </div>
              )}
            </div>
          </div>

          {/* Signature Status / Action */}
          {signatureData ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h3 className="text-white font-medium">Signature Applied</h3>
              </div>
              <div className="bg-white rounded-lg p-4 flex justify-center mb-4">
                <img src={signatureData.data} alt="Your signature" className="max-h-16 object-contain" />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => {
                    setSignatureData(null)
                    setShowSignatureModal(true)
                  }}
                >
                  Change Signature
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleApproveAfterSign(signatureData)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve & Seal Report
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="text-center space-y-4">
                <div className="bg-emerald-600/20 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
                  <PenTool className="h-8 w-8 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {signingMode === 'send_to_valuer' ? 'Sign on behalf' : 'Add Your Signature'}
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    By signing, you certify that this valuation report is accurate and complete per RICS standards.
                  </p>
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowSignatureModal(true)}
                >
                  <PenTool className="mr-2 h-4 w-4" />
                  Sign Report
                </Button>
              </div>
            </div>
          )}

          {/* Legal notice */}
          <p className="text-[10px] text-zinc-500 text-center max-w-lg mx-auto">
            By signing, I agree that this electronic signature is the legal equivalent of my handwritten signature
            and that this valuation report has been prepared in accordance with applicable professional standards.
          </p>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          signerName={signerName}
          signerIdentity={esignData.valuer.email}
          onApply={handleSignatureApplied}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  )
}
