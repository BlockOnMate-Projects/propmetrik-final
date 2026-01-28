'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  ListTodo,
  Search,
  Filter,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { projectsApi, milestonesApi } from '@/lib/projects-api'
import type { DevelopmentProject, ProjectMilestone } from '@/types/projects'

// =====================================================
// MILESTONE CARD
// =====================================================
function MilestoneCard({ 
  milestone, 
  projectName,
  onStatusChange 
}: { 
  milestone: ProjectMilestone
  projectName: string
  onStatusChange?: (id: string, status: string) => void
}) {
  const statusConfig = {
    not_started: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/20' },
    in_progress: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20' },
    overdue: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
    blocked: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  }
  
  const status = milestone.status || 'not_started'
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started
  const Icon = config.icon
  
  const dueDate = milestone.target_date 
    ? new Date(milestone.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'No date'
  
  const isOverdue = milestone.target_date && new Date(milestone.target_date) < new Date() && status !== 'completed'
  
  return (
    <Card className={cn(
      "bg-zinc-900 border-zinc-800 transition-all",
      isOverdue && "border-red-500/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
            <Icon className={cn("h-4 w-4", config.color)} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-mono text-sm text-white font-medium">{milestone.name}</h4>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{projectName}</p>
              </div>
              <Badge className={cn("font-mono text-[9px] shrink-0", config.bg, config.color)}>
                {status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            {milestone.description && (
              <p className="font-mono text-[10px] text-zinc-400 mt-2 line-clamp-2">
                {milestone.description}
              </p>
            )}
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-1 text-zinc-500">
                <Calendar className="h-3 w-3" />
                <span className={cn("font-mono text-[10px]", isOverdue && "text-red-400")}>
                  {dueDate}
                </span>
              </div>
              
              {milestone.progress !== undefined && (
                <div className="flex items-center gap-2">
                  <Progress value={milestone.progress} className="w-16 h-1.5" />
                  <span className="font-mono text-[10px] text-zinc-400">{milestone.progress}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// CREATE MILESTONE DIALOG
// =====================================================
function CreateMilestoneDialog({ 
  projects,
  onCreated 
}: { 
  projects: DevelopmentProject[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    project_id: '',
    name: '',
    description: '',
    target_date: '',
  })
  
  const handleSubmit = async () => {
    if (!formData.project_id || !formData.name) return
    
    try {
      setIsSubmitting(true)
      await milestonesApi.create(formData.project_id, {
        name: formData.name,
        description: formData.description,
        target_date: formData.target_date || undefined,
      })
      setOpen(false)
      setFormData({ project_id: '', name: '', description: '', target_date: '' })
      onCreated()
    } catch (error) {
      console.error('Failed to create milestone:', error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
          <Plus className="h-4 w-4 mr-2" />
          New Milestone
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-mono text-white">Create Milestone</DialogTitle>
          <DialogDescription className="font-mono text-xs text-zinc-500">
            Add a new milestone to track project progress
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400">Project *</Label>
            <Select 
              value={formData.project_id} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, project_id: v }))}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="font-mono text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400">Milestone Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Foundation Complete"
              className="bg-zinc-800 border-zinc-700 font-mono text-sm"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the milestone..."
              className="bg-zinc-800 border-zinc-700 font-mono text-sm min-h-[80px]"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400">Target Date</Label>
            <Input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData(prev => ({ ...prev, target_date: e.target.value }))}
              className="bg-zinc-800 border-zinc-700 font-mono text-sm"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="font-mono text-xs">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.project_id || !formData.name}
            className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================
// MAIN PAGE
// =====================================================
export default function PMMilestonesPage() {
  const [projects, setProjects] = useState<DevelopmentProject[]>([])
  const [milestones, setMilestones] = useState<(ProjectMilestone & { projectName: string })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  
  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch all projects
      const projectsRes = await projectsApi.getAll({})
      const projectsList = projectsRes.data || []
      setProjects(projectsList)
      
      // Fetch milestones for each project
      const allMilestones: (ProjectMilestone & { projectName: string })[] = []
      for (const project of projectsList) {
        try {
          const projectMilestones = await milestonesApi.getByProject(project.id) as unknown as ProjectMilestone[]
          const milestonesWithProject = (projectMilestones || []).map((m) => ({
            ...m,
            projectName: project.name || project.project_name,
          }))
          allMilestones.push(...milestonesWithProject)
        } catch (e) {
          // Project may not have milestones
        }
      }
      
      setMilestones(allMilestones)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    fetchData()
  }, [])
  
  // Filter milestones
  const filteredMilestones = milestones.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  
  // Group by status
  const upcomingMilestones = filteredMilestones.filter(m => m.status === 'not_started' || m.status === 'in_progress')
  const completedMilestones = filteredMilestones.filter(m => m.status === 'completed')
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-xl font-bold text-white">Milestones</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Track and manage project milestones
          </p>
        </div>
        <CreateMilestoneDialog projects={projects} onCreated={fetchData} />
      </div>
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search milestones..."
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
            <SelectItem value="not_started" className="font-mono text-xs">Not Started</SelectItem>
            <SelectItem value="in_progress" className="font-mono text-xs">In Progress</SelectItem>
            <SelectItem value="completed" className="font-mono text-xs">Completed</SelectItem>
            <SelectItem value="blocked" className="font-mono text-xs">Blocked</SelectItem>
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
      {!isLoading && filteredMilestones.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <ListTodo className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="font-mono text-sm text-white mb-2">No milestones found</h3>
            <p className="font-mono text-[10px] text-zinc-500">
              Create your first milestone to start tracking progress
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Milestones */}
      {!isLoading && filteredMilestones.length > 0 && (
        <div className="space-y-6">
          {/* Upcoming */}
          {upcomingMilestones.length > 0 && (
            <div>
              <h2 className="font-mono text-xs text-zinc-500 uppercase mb-3">
                Upcoming ({upcomingMilestones.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingMilestones.map((milestone) => (
                  <MilestoneCard 
                    key={milestone.id} 
                    milestone={milestone}
                    projectName={milestone.projectName}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Completed */}
          {completedMilestones.length > 0 && (
            <div>
              <h2 className="font-mono text-xs text-zinc-500 uppercase mb-3">
                Completed ({completedMilestones.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedMilestones.map((milestone) => (
                  <MilestoneCard 
                    key={milestone.id} 
                    milestone={milestone}
                    projectName={milestone.projectName}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
