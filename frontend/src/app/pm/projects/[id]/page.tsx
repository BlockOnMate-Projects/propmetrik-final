'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  HardHat,
  Layers,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { projectsApi, phasesApi, milestonesApi } from '@/lib/projects-api'
import type { DevelopmentProject, ProjectPhase, ProjectMilestone } from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// PHASE CARD
// =====================================================
function PhaseCard({ phase }: { phase: ProjectPhase }) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    not_started: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
    in_progress: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
    delayed: { bg: 'bg-red-500/20', text: 'text-red-400' },
    blocked: { bg: 'bg-red-500/20', text: 'text-red-400' },
  }
  
  const config = statusColors[phase.status] || statusColors.not_started
  
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-mono text-sm text-white font-medium">
              {phase.phase_number}. {phase.phase_name}
            </h4>
            {phase.description && (
              <p className="font-mono text-[10px] text-zinc-500 mt-0.5 line-clamp-2">
                {phase.description}
              </p>
            )}
          </div>
          <Badge className={cn("font-mono text-[9px]", config.bg, config.text)}>
            {phase.status?.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-500">Progress</span>
            <span className="font-mono text-[10px] text-white">{phase.progress_percentage || 0}%</span>
          </div>
          <Progress value={phase.progress_percentage || 0} className="h-1.5" />
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-1 text-zinc-500">
            <Calendar className="h-3 w-3" />
            <span className="font-mono text-[10px]">
              {phase.planned_start_date 
                ? new Date(phase.planned_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'TBD'
              }
              {' - '}
              {phase.planned_end_date 
                ? new Date(phase.planned_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'TBD'
              }
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// MILESTONE CARD
// =====================================================
function MilestoneCard({ milestone }: { milestone: ProjectMilestone }) {
  const statusConfig = {
    not_started: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/20' },
    in_progress: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20' },
    overdue: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
    blocked: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  }
  
  const status = milestone.status || (milestone.is_completed ? 'completed' : 'not_started')
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started
  const Icon = config.icon
  
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white">{milestone.name}</p>
        {milestone.description && (
          <p className="font-mono text-[10px] text-zinc-500 truncate">{milestone.description}</p>
        )}
      </div>
      <span className="font-mono text-[10px] text-zinc-400 shrink-0">
        {milestone.target_date 
          ? new Date(milestone.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'No date'
        }
      </span>
    </div>
  )
}

// =====================================================
// MAIN PAGE
// =====================================================
export default function PMProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [project, setProject] = useState<DevelopmentProject | null>(null)
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        
        const [projectRes, phasesRes, milestonesRes] = await Promise.all([
          projectsApi.getById(projectId),
          phasesApi.getByProject(projectId),
          milestonesApi.getByProject(projectId).catch(() => []),
        ])
        
        setProject(projectRes)
        setPhases(phasesRes || [])
        setMilestones(milestonesRes || [])
      } catch (error) {
        console.error('Failed to fetch project:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    if (projectId) {
      fetchData()
    }
  }, [projectId])
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }
  
  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="font-mono text-sm text-red-400">Project not found</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => router.push('/pm/projects')}
        >
          Back to Projects
        </Button>
      </div>
    )
  }
  
  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-400',
    active: 'bg-green-500/20 text-green-400',
    in_progress: 'bg-green-500/20 text-green-400',
    on_hold: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-zinc-500/20 text-zinc-400',
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/pm/projects"
          className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-amber-500 mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Projects
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-mono text-xl text-white font-bold">{project.name}</h1>
              <Badge className={cn("font-mono text-[9px]", statusColors[project.status] || statusColors.planning)}>
                {project.status?.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
              {(project.city || project.region) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[project.city, project.region].filter(Boolean).join(', ')}
                </span>
              )}
              {project.planned_completion_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due: {new Date(project.planned_completion_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Construction</p>
                <h3 className="font-mono text-xl font-bold text-white">{project.construction_progress || 0}%</h3>
              </div>
              <HardHat className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Phases</p>
                <h3 className="font-mono text-xl font-bold text-white">{phases.length}</h3>
              </div>
              <Layers className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Milestones</p>
                <h3 className="font-mono text-xl font-bold text-white">{milestones.length}</h3>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Budget</p>
                <h3 className="font-mono text-xl font-bold text-white">
                  {formatCurrency(project.total_budget || 0, 'GHS').replace('GH₵', '')}
                </h3>
              </div>
              <DollarSign className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
          <TabsTrigger value="overview" className="font-mono text-xs">
            <BarChart3 className="h-3 w-3 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="phases" className="font-mono text-xs">
            <Layers className="h-3 w-3 mr-1.5" />
            Phases
          </TabsTrigger>
          <TabsTrigger value="milestones" className="font-mono text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1.5" />
            Milestones
          </TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Progress */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <h3 className="font-mono text-sm text-white mb-4">Project Progress</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-400">Overall</span>
                    <span className="font-mono text-xs text-white">{project.overall_progress || 0}%</span>
                  </div>
                  <Progress value={project.overall_progress || 0} className="h-2" />
                  
                  <div className="flex items-center justify-between mt-4">
                    <span className="font-mono text-xs text-zinc-400">Construction</span>
                    <span className="font-mono text-xs text-white">{project.construction_progress || 0}%</span>
                  </div>
                  <Progress value={project.construction_progress || 0} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            {/* Recent Milestones */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm text-white">Upcoming Milestones</h3>
                  <Link href="/pm/milestones">
                    <Button variant="ghost" size="sm" className="font-mono text-xs text-amber-500 h-6 px-2">
                      View All
                    </Button>
                  </Link>
                </div>
                
                {milestones.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-zinc-500">No milestones yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {milestones.slice(0, 3).map((milestone) => (
                      <MilestoneCard key={milestone.id} milestone={milestone} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Phases Tab */}
        <TabsContent value="phases" className="mt-4">
          {phases.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-12 text-center">
                <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No phases defined</h3>
                <p className="font-mono text-[10px] text-zinc-500">
                  Phases will be added by the project administrator
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {phases
                .sort((a, b) => a.phase_number - b.phase_number)
                .map((phase) => (
                  <PhaseCard key={phase.id} phase={phase} />
                ))
              }
            </div>
          )}
        </TabsContent>
        
        {/* Milestones Tab */}
        <TabsContent value="milestones" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm text-white font-medium">All Milestones</h2>
            <Link href="/pm/milestones">
              <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                <Plus className="h-4 w-4 mr-2" />
                New Milestone
              </Button>
            </Link>
          </div>
          
          {milestones.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No milestones yet</h3>
                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                  Create milestones to track key project deliverables
                </p>
                <Link href="/pm/milestones">
                  <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Milestone
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {milestones.map((milestone) => (
                <MilestoneCard key={milestone.id} milestone={milestone} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
