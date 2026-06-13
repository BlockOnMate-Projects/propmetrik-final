'use client'

/**
 * Lease E-Sign Envelope Page
 *
 * Inline signing flow for lease agreements.
 * Uses the built-in SignatureModal instead of an external iframe.
 *
 * Flow:
 * 1. Load lease data from sessionStorage
 * 2. Show document summary + signer list
 * 3. Capture signature via inline SignatureModal
 * 4. Submit signed lease to backend
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, CheckCircle, PenTool, FileText, RefreshCw, Users } from 'lucide-react'
import Link from 'next/link'
import SignatureModal from '@/components/esign/SignatureModal'
import { SignatureData } from '@/lib/esign-types'

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
// CONSTANTS
// =====================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export default function LeaseEnvelopePage() {
  const router = useRouter()

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leaseData, setLeaseData] = useState<LeaseDocumentData | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  // Inline signing state
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null)

  // =====================================================
  // LOAD LEASE DATA
  // =====================================================

  useEffect(() => {
    try {
      setIsLoading(true)
      setError(null)

      const storedData = sessionStorage.getItem('esign_lease_document')
      if (!storedData) {
        throw new Error('No lease document data found. Please generate a lease first.')
      }

      const data: LeaseDocumentData = JSON.parse(storedData)
      setLeaseData(data)
      setIsLoading(false)
    } catch (err: any) {
      console.error('Failed to load lease data:', err)
      setError(err.message || 'Failed to load lease document')
      setIsLoading(false)
    }
  }, [])

  // =====================================================
  // SEND LEASE FOR SIGNING
  // =====================================================

  const handleSendForSigning = useCallback(async (signature?: SignatureData) => {
    if (!leaseData || isSending) return

    setIsSending(true)
    setError(null)

    try {
      const response = await authedFetch(`${API_BASE}/esign/envelopes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_url: leaseData.documentUrl,
          document_key: leaseData.documentKey,
          filename: leaseData.filename,
          subject: leaseData.subject,
          message: leaseData.message,
          signers: leaseData.signers,
          context_type: 'lease',
          context_entity_id: leaseData.tenancyId,
          context_entity_name: leaseData.propertyName,
          signature_data: signature?.data || signatureData?.data,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to send lease for signing')
      }

      setIsSent(true)
      sessionStorage.removeItem('esign_lease_document')
    } catch (err: any) {
      console.error('Failed to send lease:', err)
      setError(err.message || 'Failed to send lease for signing')
    } finally {
      setIsSending(false)
    }
  }, [leaseData, isSending, signatureData])

  // Handle signature applied from modal
  const handleSignatureApplied = useCallback((sig: SignatureData) => {
    setSignatureData(sig)
    setShowSignatureModal(false)
    handleSendForSigning(sig)
  }, [handleSendForSigning])

  // Retry
  const handleRetry = useCallback(() => {
    setError(null)
    if (signatureData) {
      handleSendForSigning(signatureData)
    } else {
      setShowSignatureModal(true)
    }
  }, [signatureData, handleSendForSigning])

  const getBackUrl = () => {
    if (leaseData?.applicationId) {
      return `/dashboard/property-management/applications/${leaseData.applicationId}`
    }
    return '/dashboard/property-management/applications'
  }

  // =====================================================
  // RENDER — LOADING
  // =====================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-foreground text-lg">Loading E-Sign...</p>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — SENT SUCCESS
  // =====================================================

  if (isSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Lease Sent for Signing</h2>
          <p className="text-muted-foreground mb-6">
            The lease agreement for <strong className="text-foreground">{leaseData?.propertyName}</strong> has been sent to all signers.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href={getBackUrl()}>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                Back to Application
              </Button>
            </Link>
            <Link href="/dashboard/property-management/applications">
              <Button variant="outline" className="border-border text-muted-foreground">
                All Applications
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — SENDING
  // =====================================================

  if (isSending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-foreground text-lg">Sending lease for signing...</p>
          <p className="text-muted-foreground text-sm mt-2">This may take a moment</p>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — ERROR (with retry)
  // =====================================================

  if (error && leaseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={handleRetry} className="bg-emerald-600 hover:bg-emerald-700">
              <RefreshCw className="mr-2 h-4 w-4" />
              {signatureData ? 'Retry Sending' : 'Try Again'}
            </Button>
            <Link href={getBackUrl()}>
              <Button variant="outline" className="border-border">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!leaseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-red-600 dark:text-red-400">No lease document found</p>
          </div>
          <Link href="/dashboard/property-management/applications">
            <Button variant="outline" className="border-border">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Applications
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // =====================================================
  // RENDER — SIGNING FLOW
  // =====================================================

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={getBackUrl()}>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">E-Sign: Lease Agreement</h1>
            <p className="text-sm text-muted-foreground">{leaseData.propertyName}</p>
          </div>
        </div>
      </div>

      {/* Document Summary & Signing Area */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl space-y-8">
          {/* Document Info Card */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-blue-600/20 rounded-lg p-3">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">Lease Agreement</h2>
                <p className="text-sm text-muted-foreground">{leaseData.filename}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Property</span>
                <p className="text-foreground mt-0.5">{leaseData.propertyName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Subject</span>
                <p className="text-foreground mt-0.5">{leaseData.subject}</p>
              </div>
            </div>
          </div>

          {/* Signers */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-foreground font-medium">Signers ({leaseData.signers.length})</h3>
            </div>
            <div className="space-y-3">
              {leaseData.signers.map((signer, i) => (
                <div key={i} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground text-sm">{signer.name}</p>
                    <p className="text-muted-foreground text-xs">{signer.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{signer.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Signature & Send */}
          {signatureData ? (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <PenTool className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-foreground font-medium">Your Signature</h3>
              </div>
              <div className="bg-card rounded-lg p-4 flex justify-center mb-4">
                <img src={signatureData.data} alt="Your signature" className="max-h-16 object-contain" />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground"
                  onClick={() => {
                    setSignatureData(null)
                    setShowSignatureModal(true)
                  }}
                >
                  Change Signature
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleSendForSigning(signatureData)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Send for Signing
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="text-center space-y-4">
                <div className="bg-emerald-600/20 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
                  <PenTool className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Sign & Send</h3>
                  <p className="text-muted-foreground text-sm">
                    Add your signature to authorise this lease agreement, then send to all signers.
                  </p>
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowSignatureModal(true)}
                >
                  <PenTool className="mr-2 h-4 w-4" />
                  Sign Lease
                </Button>
              </div>
            </div>
          )}

          {/* Legal notice */}
          <p className="text-[10px] text-muted-foreground text-center max-w-lg mx-auto">
            By signing, I agree that this electronic signature is the legal equivalent of my handwritten signature
            for the purposes of this lease agreement.
          </p>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          signerName={leaseData.signers[0]?.name || ''}
          onApply={handleSignatureApplied}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  )
}
