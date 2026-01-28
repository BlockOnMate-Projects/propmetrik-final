'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  FolderKanban,
  ListTodo,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Users,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { projectsApi } from '@/lib/projects-api'
import type { DevelopmentProject } from '@/types/projects'

// =====================================================
// STAT CARD
// =====================================================
function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend,
  color = 'amber'
}: { 
  label: string
  value: number | string
  icon: React.ElementType
  trend?: string
  color?: 'amber' | 'green' | 'red' | 'blue'
}) {
  const colorClasses = {
    amber: 'bg-amber-500/10 text-amber-500',
    green: 'bg-green-500/10 text-green-500',
    red: 'bg-red-500/10 text-red-500',
    blue: 'bg-blue-500/10 text-blue-500',
  }
  
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] text-zinc-500 uppercase">{label}</p>
            <h3 className="font-mono text-2xl font-bold text-white mt-1">{value}</h3>
            {trend && (
              <p className="font-mono text-[10px] text-green-400 mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {trend}
              </p>
            )}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// PROJECT CARD
// =====================================================
function ProjectCard({ project }: { project: DevelopmentProject }) {
  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-400',
    active: 'bg-green-500/20 text-green-400',
    in_progress: 'bg-green-500/20 text-green-400',
    on_hold: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-zinc-500/20 text-zinc-400',
  }
  
  return (
    <Link href={`/pm/projects/${project.id}`}>
      <Card className="bg-zinc-900 border-zinc-800 hover:border-amber-500/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-mono text-sm text-white font-medium">{project.name}</h4>
              <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                {project.city || 'Location TBD'}, {project.region || 'Ghana'}
              </p>
            </div>
            <Badge className={cn("font-mono text-[9px]", statusColors[project.status] || statusColors.planning)}>
              {project.status?.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono text-zinc-500">Progress</span>
              <span className="font-mono text-white">{project.overall_progress || 0}%</span>
            </div>
            <Progress value={project.overall_progress || 0} className="h-1.5" />
          </div>
          
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
            <span className="font-mono text-[10px] text-zinc-500">
              {project.total_units || 0} units
            </span>
            <span className="font-mono text-[10px] text-amber-500 flex items-center gap-1">
              View Details <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// =====================================================
// MILESTONE ITEM
// =====================================================
function MilestoneItem({ 
  title, 
  project, 
  dueDate, 
  status 
}: { 
  title: string
  project: string
  dueDate: string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
}) {
  const statusConfig = {
    pending: { icon: Clock, color: 'text-zinc-400' },
    in_progress: { icon: Clock, color: 'text-blue-400' },
    completed: { icon: CheckCircle2, color: 'text-green-400' },
    overdue: { icon: AlertTriangle, color: 'text-red-400' },
  }
  
  const config = statusConfig[status]
  const Icon = config.icon
  
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
      <Icon className={cn("h-4 w-4", config.color)} />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{title}</p>
        <p className="font-mono text-[10px] text-zinc-500">{project}</p>
      </div>
      <span className="font-mono text-[10px] text-zinc-400">{dueDate}</span>
    </div>
  )
}

// =====================================================
// MAIN DASHBOARD
// =====================================================
export default function PMDashboardPage() {
  const [projects, setProjects] = useState<DevelopmentProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const response = await projectsApi.getAll({})
        setProjects(response.data || [])
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])
  
  const activeProjects = projects.filter(p => p.status === 'under_construction' || p.status === 'pre_sales' || p.status === 'planning')
  const completedProjects = projects.filter(p => p.status === 'completed' || p.status === 'sold_out')
  
  // Mock upcoming milestones - in production, fetch from API
  const upcomingMilestones = [
    { title: 'Foundation Complete', project: 'Cantonments Heights', dueDate: 'Jan 25', status: 'in_progress' as const },
    { title: 'Structural Frame', project: 'East Legon Villas', dueDate: 'Jan 28', status: 'pending' as const },
    { title: 'MEP Rough-in', project: 'Cantonments Heights', dueDate: 'Feb 5', status: 'pending' as const },
    { title: 'Roofing Installation', project: 'Airport City Tower', dueDate: 'Feb 10', status: 'pending' as const },
  ]
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-xl font-bold text-white">Dashboard</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          Welcome back! Here's an overview of your projects.
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          label="Active Projects"
          value={activeProjects.length}
          icon={FolderKanban}
          color="amber"
        />
        <StatCard 
          label="Pending Milestones"
          value={upcomingMilestones.length}
          icon={ListTodo}
          color="blue"
        />
        <StatCard 
          label="This Week's Tasks"
          value={12}
          icon={Calendar}
          color="green"
        />
        <StatCard 
          label="Team Members"
          value={8}
          icon={Users}
          color="amber"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm text-white font-medium">My Projects</h2>
            <Link href="/pm/projects">
              <Button variant="ghost" size="sm" className="font-mono text-xs text-amber-500">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          
          {projects.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-8 text-center">
                <FolderKanban className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="font-mono text-sm text-zinc-400">No projects assigned yet</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-1">
                  Projects will appear here once assigned by an admin
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.slice(0, 4).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
        
        {/* Upcoming Milestones */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm text-white font-medium">Upcoming Milestones</h2>
            <Link href="/pm/milestones">
              <Button variant="ghost" size="sm" className="font-mono text-xs text-amber-500">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          
          <div className="space-y-2">
            {upcomingMilestones.map((milestone, i) => (
              <MilestoneItem key={i} {...milestone} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
