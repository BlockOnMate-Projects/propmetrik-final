'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText,
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
import { InvoiceManager } from '@/components/projects/budget/InvoiceManager'

interface Project {
  id: string
  name: string
  organizationId?: string
}

export default function InvoicesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authedFetch('/api/projects?limit=100')
      const result = await res.json()
      const data: Project[] = result.projects || result.data || (Array.isArray(result) ? result : [])
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

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground tracking-tight">
            INVOICES
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-1">
            Create, track and manage project invoices with approval workflows
          </p>
        </div>
      </div>

      {/* Project Selector */}
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">PROJECT:</span>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-80 bg-card border-border text-zinc-100">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {projects.map((project) => (
              <SelectItem
                key={project.id}
                value={project.id}
                className="text-zinc-100 focus:bg-muted"
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
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-50" />
          <p className="font-mono text-sm">Select a project to manage invoices</p>
        </div>
      ) : (
        <InvoiceManager
          key={selectedProjectId}
          projectId={selectedProjectId}
          organizationId={selectedProject?.organizationId || ''}
        />
      )}
    </div>
  )
}
