'use client'

/**
 * Valuation Report E-Sign Page
 * 
 * E-signature workflow for valuation reports:
 * 1. Generates/retrieves the report PDF
 * 2. Creates e-sign envelope with the PDF
 * 3. Allows user to place signature fields
 * 4. Sends for signature or signs immediately
 * 
 * Similar to lease e-sign but for valuation reports.
 */

import React, { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft, FileText, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ESignEditor, Signer, SignerRole, SIGNER_COLORS } from '@/components/e-sign'
import { reportsApi } from '@/lib/reports-api'
import { valuationsApi } from '@/lib/valuation-api'
import type { Valuation } from '@/types/valuation'

export default function ValuationESignPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    
    const valuationId = params.id as string
    const reportId = searchParams.get('reportId')
    const signerId = searchParams.get('signerId')
    const signerName = searchParams.get('signerName')
    const signerEmail = searchParams.get('signerEmail')
    const isSelf = searchParams.get('isSelf') === 'true'
    
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [valuation, setValuation] = useState<Valuation | null>(null)
    const [reportPdfUrl, setReportPdfUrl] = useState<string>('')
    const [reportName, setReportName] = useState<string>('')
    const [creatorInfo, setCreatorInfo] = useState({
        id: '',
        name: '',
        email: ''
    })

    // Load valuation and report data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                setError(null)

                // 1. Load valuation
                const valuationRes = await valuationsApi.getById(valuationId)
                if (valuationRes.error) throw new Error(valuationRes.error)
                if (!valuationRes.data) throw new Error('Valuation not found')
                setValuation(valuationRes.data as Valuation)

                // 2. Get or find report
                let currentReportId = reportId
                if (!currentReportId) {
                    // Try to get existing report
                    try {
                        const reportsRes = await reportsApi.getForValuation(valuationId)
                        if (reportsRes.reports && reportsRes.reports.length > 0) {
                            const report = reportsRes.reports.find(r => r.status === 'draft') || reportsRes.reports[0]
                            currentReportId = report.id
                        }
                    } catch {
                        throw new Error('No report found. Please generate a report first.')
                    }
                }

                if (!currentReportId) {
                    throw new Error('No report ID provided')
                }

                // 3. Get report details
                const reportRes = await reportsApi.getById(currentReportId)
                if (!reportRes) throw new Error('Report not found')
                
                setReportName(`Valuation Report - ${(valuationRes.data as Valuation).property?.address || valuationId}`)

                // 4. Generate PDF if needed and get download URL
                const statusRes = await reportsApi.getDocumentStatus(currentReportId)
                if (!statusRes.is_generated) {
                    // Generate the report first
                    await reportsApi.generate(currentReportId, {
                        template: 'ghis_standard',
                        include_floor_plans: true,
                        include_photos: true,
                    })
                }

                // Get PDF download URL
                const downloadRes = await reportsApi.download(currentReportId)
                setReportPdfUrl(downloadRes.download_url)

                // Get creator info (current user for now)
                // In production, this would come from auth context
                setCreatorInfo({
                    id: (valuationRes.data as Valuation).created_by || 'current-user',
                    name: 'Property Valuer',
                    email: 'valuer@propmetrik.com'
                })

            } catch (err) {
                console.error('Failed to load valuation report:', err)
                setError(err instanceof Error ? err.message : 'Failed to load report')
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [valuationId, reportId])

    // Default signers based on selection from modal
    const defaultSigners: Partial<Signer>[] = []
    
    if (signerId && signerName) {
        defaultSigners.push({
            id: signerId,
            role: 'signer_1' as SignerRole,
            name: decodeURIComponent(signerName),
            email: signerEmail ? decodeURIComponent(signerEmail) : '',
            order: 1
        })
    }

    // Handle save draft
    const handleSave = async (envelope: any) => {
        console.log('Saving draft:', envelope)
        // Save to backend as draft envelope
    }

    // Handle send for signatures
    const handleSend = async (envelope: any) => {
        console.log('Sending for signatures:', envelope)
        
        try {
            // Create envelope via API
            const response = await fetch('/api/v1/esign/envelopes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: reportName,
                    documentPdfUrl: reportPdfUrl,
                    contextType: 'valuation_report',
                    contextEntityId: reportId || valuationId,
                    signers: envelope.signers?.map((s: any, idx: number) => ({
                        name: s.name,
                        email: s.email,
                        phone: s.phone,
                        role: s.role || `Signer ${idx + 1}`,
                        signingOrder: s.order || idx + 1,
                    })) || [],
                    fields: envelope.fields?.map((f: any) => ({
                        signerId: f.assignedTo,
                        fieldType: f.type || 'signature',
                        page: f.page,
                        x: f.x,
                        y: f.y,
                        width: f.width || 200,
                        height: f.height || 50,
                        required: f.required !== false,
                    })) || [],
                    sendImmediately: true,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to create envelope')
            }

            const result = await response.json()
            console.log('Envelope created:', result)

            // Navigate to envelope view or back to report
            if (isSelf) {
                // Navigate to signing page
                router.push(`/dashboard/e-sign/sign/${result.id}`)
            } else {
                // Navigate back to report page with success message
                router.push(`/dashboard/valuations/${valuationId}/report?esign_sent=true`)
            }
        } catch (err) {
            console.error('Failed to send envelope:', err)
            setError(err instanceof Error ? err.message : 'Failed to send for signatures')
        }
    }

    // Handle cancel
    const handleCancel = () => {
        router.push(`/dashboard/valuations/${valuationId}/report`)
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading valuation report...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm mb-2">{error}</p>
                <p className="text-zinc-500 font-mono text-xs mb-4">
                    Please ensure the report is generated before signing.
                </p>
                <Button 
                    variant="outline" 
                    className="border-zinc-800 text-zinc-400"
                    onClick={handleCancel}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Report
                </Button>
            </div>
        )
    }

    // If we have a PDF URL, show the E-Sign editor
    if (reportPdfUrl) {
        return (
            <ESignEditor
                documentUrl={reportPdfUrl}
                documentName={reportName}
                context={{
                    type: 'valuation',
                    entityId: valuationId,
                    entityName: valuation?.property?.address || `Valuation ${valuationId}`
                }}
                defaultSigners={defaultSigners}
                onSave={handleSave}
                onSend={handleSend}
                onCancel={handleCancel}
            />
        )
    }

    // Fallback - no PDF URL
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-black">
            <FileText className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 font-mono text-sm mb-4">
                Report PDF not available
            </p>
            <Button 
                variant="outline" 
                className="border-zinc-800 text-zinc-400"
                onClick={handleCancel}
            >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Report
            </Button>
        </div>
    )
}
