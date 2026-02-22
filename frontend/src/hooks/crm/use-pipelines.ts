'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/crm-api'
import type { DealPipeline, DealStage, PipelineMetrics } from '@/types/crm'

// =====================================================
// QUERY KEYS
// =====================================================
export const pipelineKeys = {
  all: ['pipelines'] as const,
  lists: () => [...pipelineKeys.all, 'list'] as const,
  list: (includeStages?: boolean) => [...pipelineKeys.lists(), { includeStages }] as const,
  details: () => [...pipelineKeys.all, 'detail'] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  metrics: (id: string) => [...pipelineKeys.all, 'metrics', id] as const,
}

// =====================================================
// QUERIES
// =====================================================

/** Fetch all pipelines */
export function usePipelines(includeStages = true) {
  return useQuery({
    queryKey: pipelineKeys.list(includeStages),
    queryFn: () => pipelinesApi.getAll(includeStages),
  })
}

/** Fetch a single pipeline by ID */
export function usePipeline(id: string) {
  return useQuery({
    queryKey: pipelineKeys.detail(id),
    queryFn: () => pipelinesApi.getById(id),
    enabled: !!id,
  })
}

/** Fetch pipeline metrics */
export function usePipelineMetrics(id: string) {
  return useQuery({
    queryKey: pipelineKeys.metrics(id),
    queryFn: () => pipelinesApi.getMetrics(id),
    enabled: !!id,
  })
}

// =====================================================
// MUTATIONS
// =====================================================

export function useCreatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<DealPipeline>) => pipelinesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useUpdatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DealPipeline> }) => pipelinesApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: pipelineKeys.lists() })
    },
  })
}

export function useDeletePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pipelinesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useClonePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) => pipelinesApi.clone(id, newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useReorderStages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineId, stageIds }: { pipelineId: string; stageIds: string[] }) =>
      pipelinesApi.reorderStages(pipelineId, stageIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}
