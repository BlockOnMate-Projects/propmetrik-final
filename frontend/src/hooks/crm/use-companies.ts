'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { companiesApi, type CompanyFilters } from '@/lib/crm-api'
import type { Company, Contact, Deal } from '@/types/crm'

// =====================================================
// QUERY KEYS
// =====================================================
export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (filters?: CompanyFilters) => [...companyKeys.lists(), filters] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
  contacts: (companyId: string) => [...companyKeys.all, 'contacts', companyId] as const,
  deals: (companyId: string) => [...companyKeys.all, 'deals', companyId] as const,
}

// =====================================================
// QUERIES
// =====================================================

export function useCompanies(filters?: CompanyFilters) {
  return useQuery({
    queryKey: companyKeys.list(filters),
    queryFn: () => companiesApi.getAll(filters),
  })
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => companiesApi.getById(id),
    enabled: !!id,
  })
}

export function useCompanyContacts(companyId: string) {
  return useQuery({
    queryKey: companyKeys.contacts(companyId),
    queryFn: () => companiesApi.getContacts(companyId),
    enabled: !!companyId,
  })
}

export function useCompanyDeals(companyId: string) {
  return useQuery({
    queryKey: companyKeys.deals(companyId),
    queryFn: () => companiesApi.getDeals(companyId),
    enabled: !!companyId,
  })
}

// =====================================================
// MUTATIONS
// =====================================================

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Company>) => companiesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: companyKeys.all })
    },
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Company> }) => companiesApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: companyKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: companyKeys.lists() })
    },
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => companiesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: companyKeys.all })
    },
  })
}
