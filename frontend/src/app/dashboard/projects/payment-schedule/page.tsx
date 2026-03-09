'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  Loader2,
  Building2,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { authedFetch } from '@/lib/authed-fetch'
import { PaymentSchedule } from '@/components/projects/budget/PaymentSchedule'

interface Project {
  id: string
  name: string
}

export default function PaymentSchedulePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authedFetch('/api/projects?limit=100')
      const result = await res.json()
      const data: Project[] = result.success
        ? result.data || []
        : Array.isArray(result) ? result : result.projects || result.data || []
      setProjects(data)
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
            PAYMENT SCHEDULE
          </h1>
          <p className="text-zinc-500 font-mono text-xs mt-1">
            Milestone-based payment tracking, invoice linking &amp; progress monitoring
          </p>
        </div>
      </div>

      {/* Project Selector */}
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-zinc-400" />
        <span className="font-mono text-xs text-zinc-500">PROJECT:</span>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-80 bg-zinc-900 border-zinc-700 text-zinc-100">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            {projects.map((project) => (
              <SelectItem
                key={project.id}
                value={project.id}
                className="text-zinc-100 focus:bg-zinc-800"
              >
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : !selectedProjectId ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <DollarSign className="h-12 w-12 mb-3 opacity-50" />
          <p className="font-mono text-sm">Select a project to view payment schedule</p>
        </div>
      ) : (
        <PaymentSchedule
          key={selectedProjectId}
          projectId={selectedProjectId}
        />
      )}
    </div>
  )
}
