'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CostEstimator } from '@/components/projects/CostEstimator'
import { CostEstimatorDashboard } from '@/components/projects/CostEstimatorDashboard'
import { ConvertToProjectModal, ConvertPayload, ConvertResult } from '@/components/projects/ConvertToProjectModal'
import { authedFetch } from '@/lib/authed-fetch'

interface LoadedEstimate {
  id: string
  name: string
  snapshot: any
}

interface ConvertEstimate {
  id: string
  name: string
  project_type: string
  region: string
  gfa_sqm: number
  floors: number
  spec_tier: string
  currency: string
  total_cost: number
  cost_per_sqm: number
}

export default function CostEstimatorPage() {
  const router = useRouter()
  const [view, setView] = useState<'dashboard' | 'calculator'>('dashboard')
  const [loadedEstimate, setLoadedEstimate] = useState<LoadedEstimate | null>(null)
  const [convertEstimate, setConvertEstimate] = useState<ConvertEstimate | null>(null)

  const handleNewEstimate = useCallback(() => {
    setLoadedEstimate(null)
    setView('calculator')
  }, [])

  const handleBackToDashboard = useCallback(() => {
    setLoadedEstimate(null)
    setView('dashboard')
  }, [])

  // Fetch estimate from API and open in calculator
  const loadEstimate = useCallback(async (id: string) => {
    try {
      const res = await authedFetch(`/api/projects/cost-estimates/${id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.estimate) {
        setLoadedEstimate({
          id: data.estimate.id,
          name: data.estimate.name,
          snapshot: data.estimate.snapshot,
        })
        setView('calculator')
      }
    } catch (err) {
      console.error('Failed to load estimate:', err)
    }
  }, [])

  const handleViewEstimate = useCallback((id: string) => loadEstimate(id), [loadEstimate])
  const handleEditEstimate = useCallback((id: string) => loadEstimate(id), [loadEstimate])

  // Download report: load estimate into calculator then trigger direct PDF download
  const handleDownloadReport = useCallback(async (id: string) => {
    try {
      const res = await authedFetch(`/api/projects/cost-estimates/${id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.estimate) {
        setLoadedEstimate({
          id: data.estimate.id,
          name: data.estimate.name,
          snapshot: data.estimate.snapshot,
        })
        setView('calculator')
        // Allow the component to mount & compute, then auto-trigger direct download
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('cost-estimator:download'))
        }, 1500)
      }
    } catch (err) {
      console.error('Failed to load estimate for download:', err)
    }
  }, [])

  // Convert estimate to project
  const handleConvertToProject = useCallback((estimate: ConvertEstimate) => {
    setConvertEstimate(estimate)
  }, [])

  const handleConvert = useCallback(async (estimateId: string, payload: ConvertPayload): Promise<ConvertResult> => {
    const res = await authedFetch(`/api/projects/cost-estimates/${estimateId}/convert-to-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return data
  }, [])

  const handleConvertSuccess = useCallback((projectId: string) => {
    setConvertEstimate(null)
    router.push(`/dashboard/projects/${projectId}`)
  }, [router])

  if (view === 'calculator') {
    return (
      <CostEstimator
        onBack={handleBackToDashboard}
        initialEstimate={loadedEstimate}
      />
    )
  }

  return (
    <>
      <CostEstimatorDashboard
        onNewEstimate={handleNewEstimate}
        onViewEstimate={handleViewEstimate}
        onEditEstimate={handleEditEstimate}
        onDownloadReport={handleDownloadReport}
        onConvertToProject={handleConvertToProject}
      />
      {convertEstimate && (
        <ConvertToProjectModal
          estimate={convertEstimate}
          onClose={() => setConvertEstimate(null)}
          onSuccess={handleConvertSuccess}
          onConvert={handleConvert}
        />
      )}
    </>
  )
}
