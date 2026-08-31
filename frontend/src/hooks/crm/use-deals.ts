'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dealsApi, type DealFilters } from '@/lib/crm-api'
import type { Deal, DealActivity, Task, Note, CrmDocument, KanbanColumn, DealMetrics, DealStatus } from '@/types/crm'

// =====================================================
// QUERY KEYS
// =====================================================
export const dealKeys = {
  all: ['deals'] as const,
  lists: () => [...dealKeys.all, 'list'] as const,
  list: (filters?: DealFilters) => [...dealKeys.lists(), filters] as const,
  details: () => [...dealKeys.all, 'detail'] as const,
  detail: (id: string) => [...dealKeys.details(), id] as const,
  kanban: (pipelineId?: string) => [...dealKeys.all, 'kanban', pipelineId] as const,
  metrics: (filters?: Record<string, string>) => [...dealKeys.all, 'metrics', filters] as const,
  activities: (dealId: string) => [...dealKeys.all, 'activities', dealId] as const,
  tasks: (dealId: string) => [...dealKeys.all, 'tasks', dealId] as const,
  notes: (dealId: string) => [...dealKeys.all, 'notes', dealId] as const,
  documents: (dealId: string) => [...dealKeys.all, 'documents', dealId] as const,
}

// =====================================================
// QUERIES
// =====================================================

/** Fetch paginated deals list */
export function useDeals(filters?: DealFilters) {
  return useQuery({
    queryKey: dealKeys.list(filters),
    queryFn: () => dealsApi.getAll(filters),
  })
}

/** Fetch a single deal by ID */
export function useDeal(id: string) {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn: () => dealsApi.getById(id),
    enabled: !!id,
  })
}

/** Fetch kanban data for a pipeline */
export function useKanban(pipelineId?: string) {
  return useQuery({
    queryKey: dealKeys.kanban(pipelineId),
    queryFn: () => dealsApi.getKanban(pipelineId),
    enabled: !!pipelineId,
    select: (data) => {
      if (Array.isArray(data)) return data;
      // Legacy object keyed by stage id — flatten into column shape
      if (data && typeof data === 'object') {
        return Object.entries(data as Record<string, Deal[]>).map(([stageId, deals]) => ({
          stage: { id: stageId, pipeline_id: pipelineId || '', stage_name: stageId, stage_order: 0, is_active: true, created_at: '' },
          deals,
          totalValue: deals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        }));
      }
      return [];
    },
  })
}

/** Fetch deal metrics — maps backend snake_case to frontend camelCase */
export function useDealMetrics(filters?: { deal_type?: string; date_from?: string; date_to?: string }) {
  return useQuery<DealMetrics>({
    queryKey: dealKeys.metrics(filters as Record<string, string>),
    queryFn: async () => {
      const raw = await dealsApi.getMetrics(filters as any) as any
      return {
        totalDeals: (raw.total_active || 0) + (raw.won_deals || 0) + (raw.lost_deals || 0),
        activeDeals: raw.total_active || 0,
        wonDeals: raw.won_deals || 0,
        lostDeals: raw.lost_deals || 0,
        totalValue: raw.total_value || 0,
        wonValue: raw.total_weighted_value || 0,
        avgDealValue: raw.total_active > 0 ? (raw.total_value || 0) / raw.total_active : 0,
        conversionRate: (raw.total_active + raw.won_deals + raw.lost_deals) > 0
          ? raw.won_deals / (raw.total_active + raw.won_deals + raw.lost_deals)
          : 0,
      }
    },
  })
}

/** Fetch deal activities */
export function useDealActivities(dealId: string) {
  return useQuery({
    queryKey: dealKeys.activities(dealId),
    queryFn: () => dealsApi.getActivities(dealId),
    enabled: !!dealId,
  })
}

/** Fetch deal tasks */
export function useDealTasks(dealId: string) {
  return useQuery({
    queryKey: dealKeys.tasks(dealId),
    queryFn: () => dealsApi.getTasks(dealId),
    enabled: !!dealId,
  })
}

/** Fetch deal notes */
export function useDealNotes(dealId: string) {
  return useQuery({
    queryKey: dealKeys.notes(dealId),
    queryFn: () => dealsApi.getNotes(dealId),
    enabled: !!dealId,
  })
}

/** Fetch deal documents */
export function useDealDocuments(dealId: string) {
  return useQuery({
    queryKey: dealKeys.documents(dealId),
    queryFn: () => dealsApi.getDocuments(dealId),
    enabled: !!dealId,
  })
}

// =====================================================
// MUTATIONS
// =====================================================

/** Create a new deal */
export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Deal>) => dealsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.lists() })
      qc.invalidateQueries({ queryKey: dealKeys.all })
    },
  })
}

/** Update a deal */
export function useUpdateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Deal> }) => dealsApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: dealKeys.lists() })
      qc.invalidateQueries({ queryKey: dealKeys.all })
    },
  })
}

/** Delete a deal */
export function useDeleteDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dealsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all })
    },
  })
}

/** Update deal stage — with optimistic kanban update */
export function useUpdateDealStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, stageId, note }: { dealId: string; stageId: string; note?: string }) =>
      dealsApi.updateStage(dealId, stageId, note),
    onMutate: async ({ dealId, stageId }) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: dealKeys.all })

      // Snapshot all kanban queries for rollback
      const previousKanban = qc.getQueriesData<KanbanColumn[]>({ queryKey: ['deals', 'kanban'] })

      // Optimistic update: move deal between columns
      qc.setQueriesData<KanbanColumn[]>({ queryKey: ['deals', 'kanban'] }, (old) => {
        if (!old) return old
        let movedDeal: Deal | undefined

        // Remove from source column
        const updated = old.map((col) => {
          const deal = col.deals.find((d) => d.id === dealId)
          if (deal) {
            movedDeal = { ...deal, stage_id: stageId }
          }
          return {
            ...col,
            deals: col.deals.filter((d) => d.id !== dealId),
            totalValue: col.deals.filter((d) => d.id !== dealId).reduce((sum, d) => sum + (d.deal_value || 0), 0),
          }
        })

        // Add to target column
        if (movedDeal) {
          return updated.map((col) => {
            if (col.stage.id === stageId) {
              const newDeals = [...col.deals, movedDeal!]
              return {
                ...col,
                deals: newDeals,
                totalValue: newDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
              }
            }
            return col
          })
        }
        return updated
      })

      return { previousKanban }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousKanban) {
        context.previousKanban.forEach(([key, data]) => {
          if (data) qc.setQueryData(key, data)
        })
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all })
    },
  })
}

/** Add activity to a deal */
export function useAddDealActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, data }: { dealId: string; data: Partial<DealActivity> }) =>
      dealsApi.addActivity(dealId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: dealKeys.activities(variables.dealId) })
    },
  })
}
