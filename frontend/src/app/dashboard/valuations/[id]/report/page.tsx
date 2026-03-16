'use client'

/**
 * Valuation Report Page
 * 
 * Full report generation workflow:
 * 1. Creates/gets report for valuation
 * 2. Generates report content from valuation data
 * 3. Displays Tiptap-based ReportEditor for in-browser editing
 * 4. Approval workflow for signature
 */

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { reportsApi } from '@/lib/reports-api'
import { valuationsApi } from '@/lib/valuation-api'
import { ReportEditor } from '@/components/reports'
import type { ValuationReport } from '@/types/report'
import type { Valuation } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Edit3,
  Eye,
  PenTool,
} from 'lucide-react'

type PageState = 'loading' | 'generating' | 'ready' | 'error'

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const valuationId = params.id as string

  // State
  const [pageState, setPageState] = useState<PageState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [report, setReport] = useState<ValuationReport | null>(null)
  const [isGenerated, setIsGenerated] = useState(false)
  const [readOnly, setReadOnly] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Initialize: load valuation and create/get report
  useEffect(() => {
    async function initialize() {
      try {
        setPageState('loading')
        setError(null)

        // 1. Load valuation
        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')
        setValuation(valuationRes.data as Valuation)

        // 2. Check for existing report (404 means no reports exist yet)
        let currentReport: ValuationReport | null = null
        
        try {
          const reportsRes = await reportsApi.getForValuation(valuationId)
          if (reportsRes.reports && reportsRes.reports.length > 0) {
            // Use latest draft or approved report
            currentReport = reportsRes.reports.find(r => r.status === 'draft') 
              || reportsRes.reports[0]
          }
        } catch (fetchErr) {
          // 404 is expected when no reports exist - we'll create one
          console.log('No existing reports found, will create new one')
        }

        if (!currentReport) {
          // Create new draft report
          setPageState('generating')
          currentReport = await reportsApi.create({
            valuation_id: valuationId,
            template: 'ghis_standard',
          })
        }

        setReport(currentReport)

        // 3. Check if DOCX has been generated
        const statusRes = await reportsApi.getDocumentStatus(currentReport.id)
        setIsGenerated(statusRes.is_generated)

        // 4. If not generated, generate it
        if (!statusRes.is_generated) {
          setPageState('generating')
          await reportsApi.generate(currentReport.id, {
            template: 'ghis_standard',
            include_floor_plans: true,
            include_photos: true,
          })
          setIsGenerated(true)
        }

        setPageState('ready')
      } catch (err) {
        console.error('Failed to initialize report page:', err)
        setError(err instanceof Error ? err.message : 'Failed to load report')
        setPageState('error')
      }
    }

    initialize()
  }, [valuationId])

  // Regenerate report
  const handleRegenerate = useCallback(async () => {
    if (!report) return

    try {
      setRegenerating(true)
      setError(null)

      await reportsApi.generate(report.id, {
        template: 'ghis_standard',
        include_floor_plans: true,
        include_photos: true,
      })

      // Refresh the page to reload editor
      window.location.reload()
    } catch (err) {
      console.error('Failed to regenerate report:', err)
      setError(err instanceof Error ? err.message : 'Failed to regenerate report')
    } finally {
      setRegenerating(false)
    }
  }, [report])

  // Download DOCX
  const handleDownload = useCallback(async () => {
    if (!report) return

    try {
      // If DOCX hasn't been generated yet, generate it first
      if (!isGenerated) {
        setError(null)
        await reportsApi.generate(report.id, {
          template: 'ghis_standard',
          include_floor_plans: true,
          include_photos: true,
        })
        setIsGenerated(true)
      }

      const downloadRes = await reportsApi.download(report.id)
      window.open(downloadRes.download_url, '_blank')
    } catch (err) {
      console.error('Failed to download report:', err)
      setError(err instanceof Error ? err.message : 'Failed to download report')
    }
  }, [report, isGenerated])

  // Open approval via e-sign redirect flow
  const handleOpenApproval = useCallback(async () => {
    if (!report) return

    try {
      setError(null)

      // Auto-generate DOCX if not yet generated (required for approval)
      if (!isGenerated) {
        try {
          await reportsApi.generate(report.id, {
            template: 'ghis_standard',
            include_floor_plans: true,
            include_photos: true,
          })
          setIsGenerated(true)
        } catch (genErr) {
          setError('Failed to generate report document. Please try again.')
          return
        }
      }

      // Get valuer ID
      const valuerId = valuation?.created_by
      if (!valuerId) {
        setError('This valuation has no assigned valuer. Please assign a valuer first.')
        return
      }

      // Prepare e-sign envelope data from backend
      const esignData = await reportsApi.prepareEsign(report.id, valuerId)

      // Store in sessionStorage for the e-sign page
      sessionStorage.setItem('esign_report_document', JSON.stringify(esignData))

      // Redirect to e-sign envelope page
      router.push('/dashboard/e-sign/report-envelope')
    } catch (err) {
      console.error('Failed to prepare report for signing:', err)
      setError(err instanceof Error ? err.message : 'Failed to prepare report for signing')
    }
  }, [report, valuation, isGenerated, router])



  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="font-mono text-sm text-zinc-400">Loading valuation report...</span>
      </div>
    )
  }

  // Generating state
  if (pageState === 'generating') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="font-mono text-sm text-zinc-400">Generating report document...</span>
        <span className="font-mono text-xs text-zinc-500">This may take a few moments</span>
      </div>
    )
  }

  // Error state
  if (pageState === 'error' || !report) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="border border-red-500/50 bg-red-900/10 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <div>
                <h2 className="font-mono text-lg text-red-400 mb-2">Error Loading Report</h2>
                <p className="font-mono text-sm text-zinc-400 mb-4">{error || 'Unknown error occurred'}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-zinc-800 text-white font-mono text-xs hover:bg-zinc-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3 inline mr-2" />
                    Retry
                  </button>
                  <Link
                    href={`/dashboard/valuations/${valuationId}`}
                    className="px-4 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
                  >
                    Back to Valuation
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const reportDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}/reconciliation`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-amber-500" />
              <h1 className="font-mono text-lg text-white">Valuation Report</h1>
              <span className={`px-2 py-0.5 font-mono text-[10px] uppercase ${
                report.status === 'draft' ? 'bg-zinc-700 text-zinc-300' :
                report.status === 'approved' ? 'bg-green-900/50 text-green-400' :
                'bg-amber-900/50 text-amber-400'
              }`}>
                {report.status}
              </span>
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              {valuation?.property?.address || 'Property Address'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex border border-zinc-700">
            <button
              onClick={() => setReadOnly(true)}
              className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${
                readOnly ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              View
            </button>
            <button
              onClick={() => setReadOnly(false)}
              className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${
                !readOnly ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              Edit
            </button>
          </div>

          {/* Regenerate */}
          <button
            onClick={handleRegenerate}
            disabled={regenerating || report.status === 'approved'}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {regenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Regenerate Draft
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
          >
            <Download className="w-3 h-3" />
            Download
          </button>

          {/* Approve & Sign */}
          {(report.status === 'draft' || report.status === 'approved' || report.status === 'pending_review') && (
            <button
              onClick={handleOpenApproval}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-mono text-xs font-bold hover:bg-green-500 transition-colors"
            >
              <PenTool className="w-3 h-3" />
              {report.status === 'approved' ? 'Sign Report' : 'Approve & Sign'}
            </button>
          )}
        </div>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="mx-4 mt-4 p-3 border border-green-500/50 bg-green-900/10">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="font-mono text-xs text-green-400">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-green-400 hover:text-green-300"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 border border-red-500/50 bg-red-900/10">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="font-mono text-xs text-red-400">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Report Editor */}
      <div className="flex-1 overflow-hidden">
        <ReportEditor
          reportId={report.id}
          valuationId={valuationId}
          readOnly={readOnly}
          onContentChange={(hasChanges) => {
            // Track unsaved changes if needed
          }}
        />
      </div>

    </div>
  )
}
