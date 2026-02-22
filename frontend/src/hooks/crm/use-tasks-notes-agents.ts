'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, type TaskFilters, notesApi, type NoteFilters, agentsApi, type AgentFilters } from '@/lib/crm-api'
import type { Task, Note, Agent, AgentStats } from '@/types/crm'

// =====================================================
// TASK KEYS & HOOKS
// =====================================================

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: TaskFilters) => [...taskKeys.lists(), filters] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  overdue: () => [...taskKeys.all, 'overdue'] as const,
}

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => tasksApi.getAll(filters),
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: !!id,
  })
}

export function useOverdueTasks() {
  return useQuery({
    queryKey: taskKeys.overdue(),
    queryFn: () => tasksApi.getOverdue(),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Task>) => tasksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useCompleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// =====================================================
// NOTE KEYS & HOOKS
// =====================================================

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (filters?: NoteFilters) => [...noteKeys.lists(), filters] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
}

export function useNotes(filters?: NoteFilters) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: () => notesApi.getAll(filters),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Note>) => notesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all })
      // Also invalidate deal notes if entity is a deal
      qc.invalidateQueries({ queryKey: ['deals'] })
    },
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) => notesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

export function useToggleNotePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notesApi.togglePin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all })
    },
  })
}

// =====================================================
// AGENT KEYS & HOOKS
// =====================================================

export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters?: AgentFilters) => [...agentKeys.lists(), filters] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const,
  stats: () => [...agentKeys.all, 'stats'] as const,
}

export function useAgents(filters?: AgentFilters) {
  return useQuery({
    queryKey: agentKeys.list(filters),
    queryFn: () => agentsApi.getAll(filters),
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentsApi.getById(id),
    enabled: !!id,
  })
}

export function useAgentStats() {
  return useQuery({
    queryKey: agentKeys.stats(),
    queryFn: () => agentsApi.getStats(),
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Agent>) => agentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Agent> }) => agentsApi.update(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: agentKeys.detail(variables.id) })
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}
