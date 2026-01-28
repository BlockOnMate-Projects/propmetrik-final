'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  FolderKanban,
  Search,
  Filter,
  Loader2,
  MapPin,
  Calendar,
  Users,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { projectsApi } from '@/lib/projects-api'
import type { DevelopmentProject } from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

export default function PMProjectsPage() {
  const [projects, setProjects] = useState<DevelopmentProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true)
        const filters: any = {}
        if (statusFilter !== 'all') filters.status = statusFilter
        if (search) filters.search = search
        
        const response = await projectsApi.getAll(filters)
        setProjects(response.projects || response.data || [])
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchProjects()
  }, [search, statusFilter])
  
  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    in_progress: 'bg-green-500/20 text-green-400 border-green-500/30',
    on_hold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    completed: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-xl font-bold text-white">My Projects</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Manage and track your assigned development projects
          </p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 font-mono text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800 font-mono text-sm">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all" className="font-mono text-xs">All Status</SelectItem>
            <SelectItem value="planning" className="font-mono text-xs">Planning</SelectItem>
            <SelectItem value="active" className="font-mono text-xs">Active</SelectItem>
            <SelectItem value="on_hold" className="font-mono text-xs">On Hold</SelectItem>
            <SelectItem value="completed" className="font-mono text-xs">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      )}
      
      {/* Empty State */}
      {!isLoading && projects.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <FolderKanban className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="font-mono text-sm text-white mb-2">No projects found</h3>
            <p className="font-mono text-[10px] text-zinc-500">
              {search || statusFilter !== 'all' 
                ? 'Try adjusting your filters'
                : 'Projects will appear here once assigned by an admin'
              }
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Projects Grid */}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/pm/projects/${project.id}`}>
              <Card className="bg-zinc-900 border-zinc-800 hover:border-amber-500/50 transition-all cursor-pointer h-full">
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-mono text-sm text-white font-medium truncate">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3 text-zinc-500" />
                        <span className="font-mono text-[10px] text-zinc-500 truncate">
                          {project.city || 'TBD'}, {project.region || 'Ghana'}
                        </span>
                      </div>
                    </div>
                    <Badge className={cn("font-mono text-[9px] border", statusColors[project.status] || statusColors.planning)}>
                      {project.status?.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  
                  {/* Progress */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-500">Overall Progress</span>
                      <span className="font-mono text-[10px] text-white">{project.overall_progress || 0}%</span>
                    </div>
                    <Progress value={project.overall_progress || 0} className="h-1.5" />
                  </div>
                  
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800">
                    <div className="text-center">
                      <div className="font-mono text-sm text-white">{project.total_units || 0}</div>
                      <div className="font-mono text-[9px] text-zinc-500">Units</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-sm text-white">
                        {formatCurrency(project.total_budget || 0, 'GHS').replace('GH₵', '')}
                      </div>
                      <div className="font-mono text-[9px] text-zinc-500">Budget</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-sm text-white">{project.construction_progress || 0}%</div>
                      <div className="font-mono text-[9px] text-zinc-500">Built</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
