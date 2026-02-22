'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, pipelinesApi } from '@/lib/crm-api'
import type { DealMetrics } from '@/types/crm'
import type { DealType } from '@/types/crm'

// =====================================================
// QUERY KEYS
// =====================================================
export const analyticsKeys = {
  all: ['analytics'] as const,
  dealMetrics: (filters?: Record<string, string>) => [...analyticsKeys.all, 'deal-metrics', filters] as const,
  agentPerformance: (filters?: Record<string, string>) => [...analyticsKeys.all, 'agents', filters] as const,
  revenueForecast: () => [...analyticsKeys.all, 'revenue-forecast'] as const,
  pipelineAnalytics: (pipelineId?: string) => [...analyticsKeys.all, 'pipeline', pipelineId] as const,
  leaderboard: (period?: string) => [...analyticsKeys.all, 'leaderboard', period] as const,
  revenueTrend: (months?: number) => [...analyticsKeys.all, 'revenue-trend', months] as const,
  velocity: (pipelineId?: string) => [...analyticsKeys.all, 'velocity', pipelineId] as const,
  lossReasons: (filters?: Record<string, string>) => [...analyticsKeys.all, 'loss-reasons', filters] as const,
  funnel: (pipelineId?: string) => [...analyticsKeys.all, 'funnel', pipelineId] as const,
  comparison: (period?: string) => [...analyticsKeys.all, 'comparison', period] as const,
  scheduledReports: () => [...analyticsKeys.all, 'scheduled-reports'] as const,
}

// =====================================================
// QUERIES
// =====================================================

/** Fetch deal metrics with optional filters */
export function useDealMetrics(filters?: {
  deal_type?: DealType
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: analyticsKeys.dealMetrics(filters as Record<string, string>),
    queryFn: () => analyticsApi.getDealMetrics(filters),
    staleTime: 60_000,
  })
}

/** Fetch agent performance */
export function useAgentPerformance(filters?: { date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: analyticsKeys.agentPerformance(filters as Record<string, string>),
    queryFn: () => analyticsApi.getAgentPerformance(filters),
    staleTime: 60_000,
  })
}

/** Fetch revenue forecast */
export function useRevenueForecast() {
  return useQuery({
    queryKey: analyticsKeys.revenueForecast(),
    queryFn: () => analyticsApi.getRevenueForecast(),
    staleTime: 120_000,
  })
}

/** Fetch pipeline analytics */
export function usePipelineAnalytics(pipelineId?: string) {
  return useQuery({
    queryKey: analyticsKeys.pipelineAnalytics(pipelineId),
    queryFn: () => analyticsApi.getPipelineAnalytics(pipelineId!),
    enabled: !!pipelineId,
    staleTime: 60_000,
  })
}

/** Fetch leaderboard */
export function useLeaderboard(period?: string) {
  return useQuery({
    queryKey: analyticsKeys.leaderboard(period),
    queryFn: () => analyticsApi.getLeaderboard(period),
    staleTime: 60_000,
  })
}

/** Fetch revenue trend (time series) */
export function useRevenueTrend(months = 12) {
  return useQuery({
    queryKey: analyticsKeys.revenueTrend(months),
    queryFn: () => analyticsApi.getRevenueTrend(months),
    staleTime: 120_000,
  })
}

/** Fetch deal velocity / cycle time analytics */
export function useDealVelocity(pipelineId?: string) {
  return useQuery({
    queryKey: analyticsKeys.velocity(pipelineId),
    queryFn: () => analyticsApi.getDealVelocity(pipelineId),
    staleTime: 120_000,
  })
}

/** Fetch loss reason analysis */
export function useLossReasons(filters?: { date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: analyticsKeys.lossReasons(filters as Record<string, string>),
    queryFn: () => analyticsApi.getLossReasons(filters),
    staleTime: 120_000,
  })
}

/** Fetch pipeline funnel with conversion rates */
export function useFunnel(pipelineId?: string) {
  return useQuery({
    queryKey: analyticsKeys.funnel(pipelineId),
    queryFn: () => analyticsApi.getFunnel(pipelineId!),
    enabled: !!pipelineId,
    staleTime: 60_000,
  })
}

/** Fetch period comparison (MoM, WoW, QoQ) */
export function usePeriodComparison(period = 'month') {
  return useQuery({
    queryKey: analyticsKeys.comparison(period),
    queryFn: () => analyticsApi.getComparison(period),
    staleTime: 120_000,
  })
}

/** Fetch scheduled reports */
export function useScheduledReports() {
  return useQuery({
    queryKey: analyticsKeys.scheduledReports(),
    queryFn: () => analyticsApi.getScheduledReports(),
    staleTime: 60_000,
  })
}

// =====================================================
// MUTATIONS
// =====================================================

/** Create a scheduled report */
export function useCreateScheduledReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      report_type: string
      frequency: string
      format: string
      recipients: string[]
      pipeline_id?: string
    }) => analyticsApi.createScheduledReport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: analyticsKeys.scheduledReports() })
    },
  })
}

/** Delete a scheduled report */
export function useDeleteScheduledReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => analyticsApi.deleteScheduledReport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: analyticsKeys.scheduledReports() })
    },
  })
}
