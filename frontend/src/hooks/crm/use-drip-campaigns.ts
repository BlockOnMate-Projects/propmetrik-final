'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dripCampaignsApi, DripCampaign, DripCampaignStep } from '@/lib/crm-api'

export const dripCampaignKeys = {
  all: ['drip-campaigns'] as const,
  list: () => [...dripCampaignKeys.all, 'list'] as const,
  detail: (id: string) => [...dripCampaignKeys.all, 'detail', id] as const,
  enrollments: (id: string) => [...dripCampaignKeys.all, 'enrollments', id] as const,
}

export function useDripCampaigns() {
  return useQuery({
    queryKey: dripCampaignKeys.list(),
    queryFn: () => dripCampaignsApi.getAll(),
  })
}

export function useDripCampaign(id: string) {
  return useQuery({
    queryKey: dripCampaignKeys.detail(id),
    queryFn: () => dripCampaignsApi.getById(id),
    enabled: !!id,
  })
}

export function useDripEnrollments(campaignId: string) {
  return useQuery({
    queryKey: dripCampaignKeys.enrollments(campaignId),
    queryFn: () => dripCampaignsApi.getEnrollments(campaignId),
    enabled: !!campaignId,
  })
}

export function useCreateDripCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; trigger_type?: string }) =>
      dripCampaignsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.list() })
    },
  })
}

export function useUpdateDripCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<DripCampaign, 'name' | 'description' | 'trigger_type' | 'is_active'>> }) =>
      dripCampaignsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.list() })
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.detail(variables.id) })
    },
  })
}

export function useDeleteDripCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dripCampaignsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.list() })
    },
  })
}

export function useAddDripStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, data }: { campaignId: string; data: { step_order?: number; delay_days?: number; subject: string; body: string } }) =>
      dripCampaignsApi.addStep(campaignId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.detail(variables.campaignId) })
    },
  })
}

export function useDeleteDripStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, stepId }: { campaignId: string; stepId: string }) =>
      dripCampaignsApi.deleteStep(campaignId, stepId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.detail(variables.campaignId) })
    },
  })
}

export function useEnrollContacts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, contactIds }: { campaignId: string; contactIds: string[] }) =>
      dripCampaignsApi.enroll(campaignId, contactIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.list() })
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.detail(variables.campaignId) })
      queryClient.invalidateQueries({ queryKey: dripCampaignKeys.enrollments(variables.campaignId) })
    },
  })
}
