'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi, type ContactFilters } from '@/lib/crm-api'
import type { Contact, ContactStats } from '@/types/crm'

// =====================================================
// QUERY KEYS
// =====================================================
export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (filters?: ContactFilters) => [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
  stats: () => [...contactKeys.all, 'stats'] as const,
  deals: (contactId: string) => [...contactKeys.all, 'deals', contactId] as const,
  tasks: (contactId: string) => [...contactKeys.all, 'tasks', contactId] as const,
  activities: (contactId: string) => [...contactKeys.all, 'activities', contactId] as const,
}

// =====================================================
// QUERIES
// =====================================================

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: contactKeys.list(filters),
    queryFn: () => contactsApi.getAll(filters),
  })
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.getById(id),
    enabled: !!id,
  })
}

export function useContactStats() {
  return useQuery({
    queryKey: contactKeys.stats(),
    queryFn: () => contactsApi.getStats(),
  })
}

export function useContactDeals(contactId: string) {
  return useQuery({
    queryKey: contactKeys.deals(contactId),
    queryFn: () => contactsApi.getDeals(contactId),
    enabled: !!contactId,
  })
}

export function useContactTasks(contactId: string) {
  return useQuery({
    queryKey: contactKeys.tasks(contactId),
    queryFn: () => contactsApi.getTasks(contactId),
    enabled: !!contactId,
  })
}

export function useContactActivities(contactId: string) {
  return useQuery({
    queryKey: contactKeys.activities(contactId),
    queryFn: () => contactsApi.getActivities(contactId),
    enabled: !!contactId,
  })
}

// =====================================================
// MUTATIONS
// =====================================================

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Contact>) => contactsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.all })
    },
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) => contactsApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: contactKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.all })
    },
  })
}
