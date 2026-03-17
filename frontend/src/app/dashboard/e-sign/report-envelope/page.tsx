'use client'

/**
 * Report E-Sign Envelope Page
 *
 * DocuSign-like signing flow for valuation report approval.
 * Uses FieldPlacement component to render the full PDF with
 * draggable signature/name/date fields for the signer.
 *
 * Flow:
 * 1. Load report data from sessionStorage
 * 2. Mode selection: Self-sign or Send to qualified valuer
 * 3. Self-sign: Show full PDF with pre-placed signature fields
 * 4. Signer fills in all fields, then clicks "Approve & Seal Report"
 * 5. Calls approve endpoint to finalise the report
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { authedFetch } from '@/lib/authed-fetch'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, CheckCircle, PenTool, Send, User, RefreshCw, Shield } from 'lucide-react'
import Link from 'next/link'
import FieldPlacement from '@/components/esign/FieldPlacement'
import { DocumentFile, Recipient, PlacedField, SignatureData } from '@/lib/esign-types'

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
  signer: {
    name: string
    email: string
  }
  valuer: {
    id: string
    name: string
    title: string | null
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

const SIGNER_ID = 'valuer-signer'
const DOC_ID = 'report-doc'

export default function ReportEnvelopePage() {
  const router = useRouter()
  const { data: session } = useSession()

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

  // FieldPlacement state
  const [documents, setDocuments] = useState<DocumentFile[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [fields, setFields] = useState<PlacedField[]>([])
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set())
  const [signatureDataMap, setSignatureDataMap] = useState<Record<string, SignatureData>>({})
  const fieldsInitialized = useRef(false)
  const dataLoaded = useRef(false)

  // =====================================================
  // LOAD ESIGN DATA FROM sessionStorage
  // =====================================================

  useEffect(() => {
    if (dataLoaded.current) return
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const storedData = sessionStorage.getItem('esign_report_document')
        if (!storedData) {
          throw new Error('No report e-sign data found. Please click "Approve & Sign" from the report page.')
        }

        const data: ReportEsignData = JSON.parse(storedData)
        setEsignData(data)

        // Fetch the PDF with auth so HiddenPdfLoader can render it
        const pdfResponse = await authedFetch(data.documentUrl)
        if (!pdfResponse.ok) {
          throw new Error(`Failed to load PDF document (${pdfResponse.status})`)
        }
        const pdfBlob = await pdfResponse.blob()
        const pdfFile = new File([pdfBlob], data.filename || 'report.pdf', { type: 'application/pdf' })

        // Create document for FieldPlacement — with File object
        setDocuments([{
          id: DOC_ID,
          name: data.filename || 'Valuation Report',
          source: 'desktop' as const,
          file: pdfFile,
        }])

        // Create recipient — use the signer info from the server
        const userName = data.signer?.name || 'Signer'
        const userEmail = data.signer?.email || ''
        setRecipients([{
          id: SIGNER_ID,
          name: userName,
          email: userEmail,
          role: 'signer' as const,
          color: '#10b981',
          order: 1,
        }])

        dataLoaded.current = true
        setIsLoading(false)
      } catch (err: any) {
        console.error('Failed to load report e-sign data:', err)
        setError(err.message || 'Failed to load report data')
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // Update recipient name/email when session becomes available
  useEffect(() => {
    if (!session?.user || recipients.length === 0) return
    const name = session.user.name || ''
    const email = session.user.email || ''
    const current = recipients[0]
    if ((!current.name || current.name === 'Signer') && name) {
      setRecipients([{ ...current, name, email: email || current.email }])
    }
  }, [session?.user?.name, session?.user?.email])

  // Fields are NOT pre-placed — user drags them from the sidebar onto the PDF

  // =====================================================
  // HANDLE FIELD SIGNED (from FieldPlacement self-signing)
  // =====================================================

  const handleFieldSigned = useCallback((fieldId: string, sigData?: SignatureData, value?: string) => {
    setSignedFields((prev) => {
      const next = new Set(prev)
      next.add(fieldId)
      return next
    })
    if (sigData) {
      setSignatureDataMap((prev) => ({ ...prev, [fieldId]: sigData }))
    }
  }, [])

  // Check if all required fields are signed
  const requiredFields = fields.filter((f) => f.required)
  const allFieldsSigned = requiredFields.length > 0 && requiredFields.every((f) => signedFields.has(f.id))

  // Get signature data for approval — find any signature-type field
  const getSignatureData = useCallback((): string | undefined => {
    const sigFieldId = fields.find((f) => f.type === 'signature')?.id
    if (!sigFieldId) return undefined
    return signatureDataMap[sigFieldId]?.data
  }, [signatureDataMap, fields])

  // =====================================================
  // HANDLE APPROVAL AFTER SIGNING
  // =====================================================

  const handleApproveAfterSign = useCallback(async () => {
    if (!esignData || isApproving) return

    setIsApproving(true)
    setError(null)

    try {
      const signatureData = getSignatureData()

      // Persist the valuer's drawn signature to their profile if this flow collected one.
      // Approval checks for a stored professional signature before allowing seal/approval.
      if (signatureData && esignData.valuer?.id) {
        const signatureResponse = await authedFetch(`${API_BASE}/valuers/${esignData.valuer.id}/signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_data_url: signatureData,
          }),
        })

        if (!signatureResponse.ok) {
          const signatureResult = await signatureResponse.json().catch(() => ({}))
          throw new Error(signatureResult.message || signatureResult.error || 'Failed to save signature on file')
        }
      }

      // Collect ALL signed field data with positions for PDF burn-in
      const esignFields = fields
        .filter((f) => signedFields.has(f.id))
        .map((f) => ({
          id: f.id,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          data: signatureDataMap[f.id]?.data,  // base64 image (all field types have images)
          value: f.value,
        }))

      const response = await authedFetch(`${API_BASE}/reports/${esignData.reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuer_id: esignData.valuer.id,
          comments: 'Approved via e-sign workflow',
          generate_pdf: true,
          signature_data: signatureData,
          esign_fields: esignFields,
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
  }, [esignData, isApproving, getSignatureData, fields, signedFields, signatureDataMap])

  // Retry approval
  const handleRetry = useCallback(() => {
    setError(null)
    if (allFieldsSigned) {
      handleApproveAfterSign()
    }
  }, [allFieldsSigned, handleApproveAfterSign])

  // Back URL
  const getBackUrl = () => {
    if (esignData) {
      return `/dashboard/valuations/${esignData.valuationId}/report`
    }
    return '/dashboard/valuations'
  }

  // Current user info for FieldPlacement — use session user
  const currentUser = session?.user
    ? { name: session.user.name || '', email: session.user.email || '' }
    : esignData?.signer
      ? { name: esignData.signer.name, email: esignData.signer.email }
      : undefined

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
            {approvalResult.pdf?.success && approvalResult.pdf?.url ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => window.open(approvalResult.pdf!.url, '_blank')}
              >
                View Signed PDF
              </Button>
            ) : (
              <Link href={getBackUrl()}>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  View Report
                </Button>
              </Link>
            )}
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

  // (isApproving and error states are rendered inline within the signing UI below)

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
                {esignData.propertyAddress} &mdash; {session?.user?.name || esignData.signer?.name}
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
  // RENDER — FULL PDF SIGNING (DocuSign-like)
  // =====================================================

  const signerName = signingMode === 'send_to_valuer'
    ? qualifiedValuerName
    : (session?.user?.name || esignData.signer?.name || '')

  const signedCount = requiredFields.filter((f) => signedFields.has(f.id)).length

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
              onClick={() => {
                fieldsInitialized.current = false
                setFields([])
                setSignedFields(new Set())
                setSignatureDataMap({})
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
              <h1 className="text-lg font-bold text-white">E-Sign: Valuation Report</h1>
              <p className="text-xs text-zinc-400">
                {esignData.propertyAddress} &mdash; {signerName}
              </p>
            </div>
          </div>

          {/* Progress + Approve button */}
          <div className="flex items-center gap-4">
            <div className="text-sm text-zinc-400">
              <span className="text-emerald-400 font-medium">{signedCount}</span>
              <span> / {requiredFields.length} fields completed</span>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              disabled={!allFieldsSigned || isApproving}
              onClick={handleApproveAfterSign}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Approve & Seal Report
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Inline error banner */}
      {error && (
        <div className="bg-red-900/30 border-b border-red-700 px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-red-400 text-sm">{error}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 h-7 px-2"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
              {allFieldsSigned && (
                <Button
                  size="sm"
                  className="bg-red-700 hover:bg-red-600 h-7 px-3"
                  onClick={handleRetry}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FieldPlacement — full PDF viewer with signature fields */}
      <div className="flex-1 overflow-hidden relative">
        {isApproving && (
          <div className="absolute inset-0 bg-zinc-950/70 z-50 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto mb-3" />
              <p className="text-white text-sm">Approving & generating PDF...</p>
            </div>
          </div>
        )}
        <FieldPlacement
          documents={documents}
          recipients={recipients}
          fields={fields}
          onFieldsChange={setFields}
          isSelfSigning={true}
          signedFields={signedFields}
          onFieldSigned={handleFieldSigned}
          currentUser={currentUser}
          allowedFieldTypes={['signature', 'name', 'date_signed']}
        />
      </div>

      {/* Legal notice */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-6 py-2 flex-shrink-0">
        <p className="text-[10px] text-zinc-500 text-center">
          By signing, I agree that this electronic signature is the legal equivalent of my handwritten signature
          and that this valuation report has been prepared in accordance with applicable professional standards.
        </p>
      </div>
    </div>
  )
}
